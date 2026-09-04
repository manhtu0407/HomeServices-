import { useMemo, useReducer, useRef } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native'
import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, radius, shadow, spacing, typography } from '@/design/theme'
import { adminControlService } from '@/lib/services'
import type {
  AdminViewActor,
  AdminViewManagerNominationSummary,
  AdminViewOperationsResponse,
  AdminViewOperatorProvisioningSummary,
  AdminViewSubAdminAccountCandidate,
  AdminViewSubAdminSummary,
} from '@/lib/api-types/admin'
import { isLocalDealStatus, type AdminCapability } from '@nestscout/shared'
import { localizedStatusLabel, type AppLanguage } from '@/lib/app-language'
import {
  clearStableClientRequestId,
  shouldRetainClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from '@/lib/client-request-id'
import { AdminTeamOwnerActions } from './admin-team-owner-actions'
import { AdminText } from './admin-text'

type OperationPanel = 'operations' | 'workers' | 'transactions'

type OperationsCopy = {
  attention: {
    open_disputes: string
    other_admin_queue: string
    payment_attention: string
    worker_applications: string
  }
  audit: string
  auditAction: Record<string, string>
  auditContext: Record<string, string>
  auditRole: Record<string, string>
  empty: string
  flow: string
  generatedAt: (value: string) => string
  loading: string
  unknownAuditAction: string
  unknownAuditContext: string
  unknownStatus: string
  quality: {
    workers_in_verification: string
    workers_suspended: string
  }
  retry: string
  title: string
}

type TeamCopy = {
  actions: {
    add: string
    cancelNomination: string
    close: string
    grant: string
    nominate: string
    revoke: string
    save: string
    search: string
    update: string
  }
  capabilities: Record<AdminCapability, string>
  empty: string
  lastActivity: string
  loading: string
  memberRole: { customer: string; worker: string }
  nominationEmpty: string
  nominationHint: string
  nominationLabel: string
  nominationPending: string
  nominationTitle: string
  notice: string
  ownerOnly: string
  reason: string
  revokeReason: string
  searchEmpty: string
  searchHint: string
  searchLabel: string
  status: { active: string; revoked: string }
  subtitle: string
  title: string
}

const operationsCopy: Record<AppLanguage, OperationsCopy> = {
  vi: {
    attention: {
      open_disputes: 'Tranh chấp đang mở',
      other_admin_queue: 'Việc vận hành cần xem',
      payment_attention: 'Thanh toán cần đối soát',
      worker_applications: 'Hồ sơ thợ cần duyệt',
    },
    audit: 'Nhật ký thay đổi quyền gần đây',
    auditAction: {
      grant: 'Cấp quyền',
      reinstate: 'Khôi phục hoạt động',
      revoke: 'Thu hồi quyền',
      review: 'Duyệt hồ sơ',
      suspend: 'Tạm dừng hoạt động',
      update: 'Cập nhật quyền',
    },
    auditContext: {
      admin_operator: 'Quản trị viên phụ',
      allow: 'Đã chấp thuận',
      deny: 'Đã từ chối',
      worker_access: 'Quyền hoạt động của thợ',
      worker_application: 'Hồ sơ thợ',
    },
    auditRole: {
      admin: 'Quản trị viên chính',
      admin_operator: 'Quản trị viên phụ',
      customer: 'Khách hàng',
      system: 'Hệ thống',
      worker: 'Thợ',
    },
    empty: 'Hiện chưa có mục nào cần can thiệp.',
    flow: 'Luồng việc đang hoạt động',
    generatedAt: (value) => `Dữ liệu thực tại ${value}`,
    loading: 'Đang tải tình hình vận hành...',
    unknownAuditAction: 'Cập nhật quyền quản trị',
    unknownAuditContext: 'Nội dung quản trị',
    unknownStatus: 'Trạng thái chưa xác định',
    quality: {
      workers_in_verification: 'Thợ đang xác minh',
      workers_suspended: 'Thợ đang tạm dừng',
    },
    retry: 'Thử lại',
    title: 'Vận hành',
  },
  en: {
    attention: {
      open_disputes: 'Open disputes',
      other_admin_queue: 'Operational items to review',
      payment_attention: 'Payments needing reconciliation',
      worker_applications: 'Worker applications to review',
    },
    audit: 'Recent access audit',
    auditAction: {
      grant: 'Access granted',
      reinstate: 'Access restored',
      revoke: 'Access revoked',
      review: 'Application reviewed',
      suspend: 'Access suspended',
      update: 'Access updated',
    },
    auditContext: {
      admin_operator: 'Sub Admin account',
      allow: 'Allowed',
      deny: 'Denied',
      worker_access: 'Worker access',
      worker_application: 'Worker application',
    },
    auditRole: {
      admin: 'Owner Admin',
      admin_operator: 'Sub Admin',
      customer: 'Customer',
      system: 'System',
      worker: 'Worker',
    },
    empty: 'There are no items requiring intervention right now.',
    flow: 'Active service flow',
    generatedAt: (value) => `Live data at ${value}`,
    loading: 'Loading operations...',
    unknownAuditAction: 'Admin access updated',
    unknownAuditContext: 'Administrative action',
    unknownStatus: 'Unknown status',
    quality: {
      workers_in_verification: 'Workers in verification',
      workers_suspended: 'Suspended workers',
    },
    retry: 'Try again',
    title: 'Operations',
  },
}

const teamCopy: Record<AppLanguage, TeamCopy> = {
  vi: {
    actions: {
      add: 'Đề cử quản lý',
      cancelNomination: 'Hủy đề cử',
      close: 'Đóng',
      grant: 'Cấp quyền',
      nominate: 'Đề cử',
      revoke: 'Thu hồi',
      save: 'Lưu quyền',
      search: 'Tìm tài khoản',
      update: 'Chỉnh quyền',
    },
    capabilities: {
      'finance.read': 'Xem tổng quan tài chính',
      'finance.reconcile': 'Đối soát thanh toán',
      'finance.tax.manage': 'Quản lý chính sách thuế',
      'operations.read': 'Xem vận hành',
      'operations.triage': 'Chuẩn bị hồ sơ hỗ trợ',
      'payouts.process': 'Xử lý chi trả thợ',
      'payouts.read': 'Xem chi trả thợ',
      'system.manage': 'Quản lý dữ liệu hệ thống',
      'system.read': 'Xem dữ liệu hệ thống',
      'team.read': 'Xem đội ngũ quản trị',
      'transactions.read': 'Xem giao dịch',
      'workers.manage': 'Tạm dừng / khôi phục thợ',
      'workers.read': 'Xem hồ sơ thợ',
      'workers.review': 'Duyệt hồ sơ thợ',
    },
    empty: 'Chưa có quản trị viên phụ nào được cấp quyền.',
    lastActivity: 'Hoạt động gần nhất',
    loading: 'Đang tải đội ngũ quản trị...',
    memberRole: { customer: 'Tài khoản khách', worker: 'Tài khoản thợ' },
    nominationEmpty: 'Chưa có quản lý nào chờ cấp quyền.',
    nominationHint: 'Chỉ tài khoản do Owner đề cử mới có thể được cấp quyền quản trị.',
    nominationLabel: 'Quản lý do Owner đề cử',
    nominationPending: 'Chờ cấp quyền',
    nominationTitle: 'Đề cử quản lý',
    notice: 'Danh sách quản lý và quyền quản trị đã được cập nhật.',
    ownerOnly: 'Chỉ quản trị viên chính mới có thể thay đổi quyền.',
    reason: 'Lý do',
    revokeReason: 'Nhập lý do thu hồi quyền',
    searchEmpty: 'Không tìm thấy tài khoản phù hợp.',
    searchHint: 'Tìm theo tên hoặc số điện thoại của tài khoản đã đăng ký.',
    searchLabel: 'Tên hoặc số điện thoại',
    status: { active: 'Đang hoạt động', revoked: 'Đã thu hồi' },
    subtitle: 'Quản trị viên phụ không có quyền của quản trị viên chính. Mỗi quyền được máy chủ kiểm tra lại cho từng thao tác.',
    title: 'Đội quản trị',
  },
  en: {
    actions: {
      add: 'Nominate manager',
      cancelNomination: 'Cancel nomination',
      close: 'Close',
      grant: 'Grant access',
      nominate: 'Nominate',
      revoke: 'Revoke',
      save: 'Save access',
      search: 'Find account',
      update: 'Edit access',
    },
    capabilities: {
      'finance.read': 'View finance overview',
      'finance.reconcile': 'Reconcile payments',
      'finance.tax.manage': 'Manage tax policies',
      'operations.read': 'View operations',
      'operations.triage': 'Prepare support cases',
      'payouts.process': 'Process worker payouts',
      'payouts.read': 'View worker payouts',
      'system.manage': 'Manage system data',
      'system.read': 'View system data',
      'team.read': 'View admin team',
      'transactions.read': 'View transactions',
      'workers.manage': 'Suspend / reinstate workers',
      'workers.read': 'View worker applications',
      'workers.review': 'Review worker applications',
    },
    empty: 'No Sub Admin account has been granted access.',
    lastActivity: 'Last activity',
    loading: 'Loading the admin team...',
    memberRole: { customer: 'Customer account', worker: 'Worker account' },
    nominationEmpty: 'There is no manager waiting for access.',
    nominationHint: 'Only an account nominated by the Owner can receive Admin access.',
    nominationLabel: 'Nominated by Owner',
    nominationPending: 'Awaiting access',
    nominationTitle: 'Manager nominations',
    notice: 'The manager list and Admin access were updated.',
    ownerOnly: 'Only the Owner Admin can change access.',
    reason: 'Reason',
    revokeReason: 'Enter the reason for revoking access',
    searchEmpty: 'No matching registered account was found.',
    searchHint: 'Search by the name or phone number of a registered account.',
    searchLabel: 'Name or phone number',
    status: { active: 'Active', revoked: 'Revoked' },
    subtitle: 'Sub Admin accounts never receive Owner access. Every capability is checked again by the server for each action.',
    title: 'Sub Admin',
  },
}

const operationsDateFormatter: Record<AppLanguage, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  vi: new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }),
}

export function AdminOperationsOverview({
  language,
  snapshot,
  loading,
  error,
  onOpenPanel,
  onRetry,
}: {
  language: AppLanguage
  snapshot: AdminViewOperationsResponse | null
  loading: boolean
  error: string | null
  onOpenPanel: (panel: Exclude<OperationPanel, 'operations'>) => void
  onRetry: () => void
}) {
  const copy = operationsCopy[language]
  const formatDate = (value: string) => {
    try {
      return operationsDateFormatter[language].format(new Date(value))
    } catch {
      return value
    }
  }

  if (loading) return <LoadingState label={copy.loading} />
  if (error) return <ErrorState label={error} retryLabel={copy.retry} onRetry={onRetry} />
  if (!snapshot) return <EmptyState label={copy.empty} />

  const attention = snapshot.attention.filter((item) => item.count > 0)
  return (
    <View testID="admin-operations-overview" style={styles.stack}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <AdminText textRole="title2" style={styles.sectionTitle}>{copy.title}</AdminText>
          <AdminText textRole="footnote" style={styles.subtle}>{copy.generatedAt(formatDate(snapshot.generated_at))}</AdminText>
        </View>
      </View>

      <AdminText textRole="headline" style={styles.blockTitle}>{copy.title}</AdminText>
      {attention.length === 0 ? <EmptyState label={copy.empty} /> : attention.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={copy.attention[item.key]}
          onPress={() => item.target_section !== 'operations' && onOpenPanel(item.target_section)}
          style={styles.attentionRow}
          testID={`admin-operation-attention-${item.key}`}
        >
          <AdminText textRole="subheadline" style={styles.attentionLabel}>{copy.attention[item.key]}</AdminText>
          <AdminText numeric textRole="headline" style={styles.attentionCount}>{item.count}</AdminText>
        </Pressable>
      ))}

      <AdminText textRole="headline" style={styles.blockTitle}>{copy.flow}</AdminText>
      {snapshot.flow.length === 0 ? <EmptyState label={copy.empty} /> : <View style={styles.metricSurface}>
      {snapshot.flow.map((item) => <MetricRow key={item.status} label={isLocalDealStatus(item.status) ? localizedStatusLabel(item.status, language) : copy.unknownStatus} value={item.count} />)}
      </View>}

      <AdminText textRole="headline" style={styles.blockTitle}>{copy.quality.workers_in_verification}</AdminText>
      <View style={styles.metricSurface}>
        {snapshot.quality.map((item) => <MetricRow key={item.key} label={copy.quality[item.key]} value={item.count} />)}
      </View>

      <AdminText textRole="headline" style={styles.blockTitle}>{copy.audit}</AdminText>
      {snapshot.audit_events.length === 0 ? <EmptyState label={copy.empty} /> : <View style={styles.auditSurface}>
        {snapshot.audit_events.map((event) => (
          <View key={event.id} style={styles.auditRow}>
            <View style={styles.auditText}>
              <AdminText textRole="headline" style={styles.auditTitle}>{copy.auditAction[event.action] ?? copy.unknownAuditAction}</AdminText>
              <AdminText textRole="footnote" style={styles.subtle}>{auditActorLabel(event.actor_name, event.actor_role, copy)} · {copy.auditContext[event.topic ?? ''] ?? copy.auditContext[event.decision] ?? copy.unknownAuditContext}</AdminText>
            </View>
            <AdminText textRole="footnote" style={styles.auditDate}>{formatDate(event.occurred_at)}</AdminText>
          </View>
        ))}
      </View>}
    </View>
  )
}

export function AdminSubAdminPanel({
  actor,
  error,
  language,
  loading,
  members,
  nominations,
  pendingAccounts,
  onRetry,
  onRefresh,
  reduceMotion,
}: {
  actor: AdminViewActor | null
  error: string | null
  language: AppLanguage
  loading: boolean
  members: AdminViewSubAdminSummary[]
  nominations: AdminViewManagerNominationSummary[]
  pendingAccounts: AdminViewOperatorProvisioningSummary[]
  onRetry: () => void
  onRefresh: () => Promise<void>
  reduceMotion: boolean
}) {
  const copy = teamCopy[language]
  const [state, dispatch] = useReducer(subAdminReducer, initialSubAdminState)
  const pendingAccessRequest = useRef<PendingClientRequestId | null>(null)
  const {
    accounts,
    actionError,
    capabilities,
    editor,
    notice,
    pending,
    reason,
    searchComplete,
    searchQuery,
    searching,
  } = state
  const isOwner = actor?.access_level === 'owner'

  const openSearch = () => {
    dispatch({ type: 'open_search' })
  }

  const openEditor = (mode: 'nominate' | 'grant' | 'update' | 'revoke', target: EditorTarget) => {
    dispatch({ type: 'open_editor', editor: { mode, target } })
  }

  const closeEditor = () => {
    if (!pending) dispatch({ type: 'close_editor' })
  }

  const search = async () => {
    if (searchQuery.trim().length < 2) {
      dispatch({ type: 'set_error', error: copy.searchHint })
      return
    }
    dispatch({ type: 'search_start' })
    const result = await adminControlService.searchSubAdminAccounts(searchQuery.trim())
    if (result.success) {
      dispatch({ type: 'search_result', accounts: result.data.accounts, error: null })
    } else {
      dispatch({ type: 'search_result', accounts: [], error: result.error })
    }
  }

  const toggleCapability = (capability: AdminCapability) => {
    if (capability === 'finance.read') return
    dispatch({ type: 'toggle_capability', capability })
  }

  const save = async () => {
    if (!editor || editor.mode === 'search' || !('target' in editor)) return
    if ((editor.mode === 'grant' || editor.mode === 'update') && capabilities.length === 0) {
      dispatch({ type: 'set_error', error: copy.searchHint })
      return
    }
    if (editor.mode === 'revoke' && reason.trim().length < 3) {
      dispatch({ type: 'set_error', error: copy.revokeReason })
      return
    }
    dispatch({ type: 'pending_start' })
    let requestFingerprint: string | null = null
    const accessAction = editor.mode === 'nominate' ? null : editor.mode
    const result = accessAction === null
      ? await adminControlService.nominateManager(editor.target.user_id)
      : await (async () => {
        const nextCapabilities = accessAction === 'revoke'
          ? []
          : Array.from(new Set<AdminCapability>(['finance.read', ...capabilities]))
        const expectedVersion = 'version' in editor.target ? editor.target.version : 0
        requestFingerprint = JSON.stringify({ action: accessAction, capabilities: [...nextCapabilities].sort(), reason: reason.trim(), userId: editor.target.user_id, version: expectedVersion })
        return adminControlService.setSubAdminAccess(editor.target.user_id, {
          action: accessAction,
          capabilities: nextCapabilities,
          client_request_id: stableClientRequestId(pendingAccessRequest, requestFingerprint),
          expected_version: expectedVersion,
          ...(accessAction === 'revoke' ? { reason: reason.trim() } : {}),
        })
      })()
    if (result.success) {
      if (requestFingerprint) clearStableClientRequestId(pendingAccessRequest, requestFingerprint)
      dispatch({ type: 'save_success', notice: copy.notice })
      await onRefresh()
    } else {
      if (requestFingerprint && !shouldRetainClientRequestId(result)) clearStableClientRequestId(pendingAccessRequest, requestFingerprint)
      dispatch({ type: 'pending_failure', error: result.error })
    }
    if (result.success) dispatch({ type: 'pending_finish' })
  }

  const cancelNomination = async (nominationId: string) => {
    dispatch({ type: 'pending_start' })
    const result = await adminControlService.cancelManagerNomination(nominationId)
    if (result.success) {
      dispatch({ type: 'set_notice', notice: copy.notice })
      await onRefresh()
    } else {
      dispatch({ type: 'pending_failure', error: result.error })
    }
    if (result.success) dispatch({ type: 'pending_finish' })
  }

  const formattedMembers = useMemo(() => members.map((member) => ({
    ...member,
    roleLabel: copy.memberRole[member.baseline_role],
  })), [copy.memberRole, members])

  if (loading) return <LoadingState label={copy.loading} />
  if (error) return <ErrorState label={error} retryLabel={operationsCopy[language].retry} onRetry={onRetry} />

  return (
    <View testID="admin-sub-admin-panel" style={styles.stack}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <AdminText textRole="title2" style={styles.sectionTitle}>{copy.title}</AdminText>
          <AdminText textRole="footnote" style={styles.subtle}>{copy.subtitle}</AdminText>
        </View>
      </View>
      {!isOwner && <AdminText textRole="footnote" style={styles.ownerOnly}>{copy.ownerOnly}</AdminText>}
      {notice && <View accessibilityRole="alert" style={styles.notice}><AdminText textRole="subheadline" style={styles.noticeText}>{notice}</AdminText></View>}
      {isOwner ? <AdminTeamOwnerActions capabilityLabels={copy.capabilities} language={language} onNominateExisting={openSearch} onRefresh={onRefresh} pendingAccounts={pendingAccounts} reduceMotion={reduceMotion} /> : null}
      {isOwner && <>
        <AdminText textRole="headline" style={styles.blockTitle}>{copy.nominationTitle}</AdminText>
        <AdminText textRole="footnote" style={styles.subtle}>{copy.nominationHint}</AdminText>
        {nominations.length === 0 ? <EmptyState label={copy.nominationEmpty} /> : nominations.map((nomination) => (
          <View key={nomination.id} style={styles.memberCard} testID={`admin-manager-nomination-${nomination.id}`}>
            <View style={styles.cardHeader}>
              <View style={styles.memberTitleBlock}>
                <AdminText textRole="headline" style={styles.memberName}>{nomination.full_name ?? nomination.phone_masked ?? nomination.user_id}</AdminText>
                <AdminText textRole="footnote" style={styles.subtle}>{copy.memberRole[nomination.role]} · {nomination.phone_masked ?? ''}</AdminText>
              </View>
              <StatusPill label={copy.nominationPending} tone="neutral" />
            </View>
            <AdminText textRole="footnote" style={styles.subtle}>{copy.nominationLabel}</AdminText>
            <View style={styles.memberActions}>
              <KaelButton label={copy.actions.grant} onPress={() => openEditor('grant', nomination)} testID={`admin-manager-nomination-${nomination.id}-grant`} variant="primary" style={styles.memberAction} />
              <KaelButton label={copy.actions.cancelNomination} onPress={() => void cancelNomination(nomination.id)} disabled={pending} size="small" testID={`admin-manager-nomination-${nomination.id}-cancel`} variant="secondary" style={styles.memberAction} />
            </View>
          </View>
        ))}
      </>}
      {formattedMembers.length === 0 ? <EmptyState label={copy.empty} /> : formattedMembers.map((member) => (
        <View key={member.user_id} style={styles.memberCard} testID={`admin-sub-admin-${member.user_id}`}>
          <View style={styles.cardHeader}>
            <View style={styles.memberTitleBlock}>
              <AdminText textRole="headline" style={styles.memberName}>{member.full_name ?? member.phone_masked ?? member.user_id}</AdminText>
              <AdminText textRole="footnote" style={styles.subtle}>{member.roleLabel} · {member.phone_masked ?? ''}</AdminText>
            </View>
            <StatusPill label={copy.status[member.status]} tone={member.status === 'active' ? 'success' : 'neutral'} />
          </View>
          <View style={styles.capabilityRow}>
            {member.capabilities.map((capability) => <AdminText textRole="subheadline" key={capability} style={styles.capabilityText}>{copy.capabilities[capability]}</AdminText>)}
          </View>
          <AdminText textRole="footnote" style={styles.subtle}>{copy.lastActivity}: {member.last_activity_at ?? '—'}</AdminText>
          {isOwner && <View style={styles.memberActions}>
            {member.status === 'active' && <>
              <KaelButton label={copy.actions.update} onPress={() => openEditor('update', member)} variant="secondary" style={styles.memberAction} />
              <KaelButton label={copy.actions.revoke} onPress={() => openEditor('revoke', member)} variant="secondary" style={styles.memberAction} />
            </>}
            {member.status === 'revoked' && <KaelButton label={copy.actions.grant} onPress={() => openEditor('grant', member)} variant="secondary" style={styles.memberAction} />}
          </View>}
        </View>
      ))}

      <Modal animationType={reduceMotion ? 'none' : 'fade'} transparent visible={editor !== null} onRequestClose={closeEditor}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {editor?.mode === 'search' ? <>
              <AdminText textRole="title2" style={styles.modalTitle}>{copy.actions.add}</AdminText>
              <AdminText textRole="headline" style={styles.modalSubtitle}>{copy.searchHint}</AdminText>
              <KaelTextField
                accessibilityLabel={copy.searchLabel}
                autoCapitalize="none"
                onChangeText={(value) => dispatch({ type: 'set_search_query', value })}
                placeholder={copy.searchLabel}
                placeholderTextColor={color.text.muted}
                value={searchQuery}
              />
              {actionError && <AdminText textRole="subheadline" accessibilityRole="alert" style={styles.actionError}>{actionError}</AdminText>}
              <View style={styles.modalActions}>
                <KaelButton label={copy.actions.close} onPress={closeEditor} variant="secondary" style={styles.modalAction} />
                <KaelButton label={searching ? copy.loading : copy.actions.search} onPress={() => void search()} disabled={searching} variant="primary" style={styles.modalAction} />
              </View>
              {searchComplete && accounts.length === 0 && <AdminText textRole="subheadline" style={styles.emptyText}>{copy.searchEmpty}</AdminText>}
              {accounts.map((account) => <Pressable key={account.user_id} accessibilityRole="button" accessibilityLabel={account.full_name ?? account.user_id} onPress={() => openEditor('nominate', account)} style={styles.searchResult}>
                <AdminText textRole="headline" style={styles.memberName}>{account.full_name ?? account.phone_masked ?? account.user_id}</AdminText>
                <AdminText textRole="footnote" style={styles.subtle}>{copy.memberRole[account.role]} · {account.phone_masked ?? ''}</AdminText>
              </Pressable>)}
            </> : editor && 'target' in editor ? <>
              <AdminText textRole="title2" style={styles.modalTitle}>{editor.mode === 'revoke' ? copy.actions.revoke : editor.mode === 'grant' ? copy.actions.grant : editor.mode === 'nominate' ? copy.actions.add : copy.actions.update}</AdminText>
              <AdminText textRole="headline" style={styles.modalSubtitle}>{editor.target.full_name ?? editor.target.phone_masked ?? editor.target.user_id}</AdminText>
              {editor.mode === 'revoke' ? <KaelTextField
                accessibilityLabel={copy.revokeReason}
                multiline
                onChangeText={(value) => dispatch({ type: 'set_reason', value })}
                placeholder={copy.revokeReason}
                placeholderTextColor={color.text.muted}
                value={reason}
              /> : editor.mode === 'nominate' ? <AdminText textRole="footnote" style={styles.subtle}>{copy.nominationHint}</AdminText> : <View style={styles.capabilityPicker}>
                {(Object.keys(copy.capabilities) as AdminCapability[]).map((capability) => <KaelChip
                  key={capability}
                  accessibilityLabel={copy.capabilities[capability]}
                  accessibilityState={{ disabled: capability === 'finance.read', selected: capabilities.includes(capability) }}
                  disabled={capability === 'finance.read'}
                  label={copy.capabilities[capability]}
                  onPress={() => toggleCapability(capability)}
                  variant={capabilities.includes(capability) ? 'selected' : 'unselected'}
                />)}
              </View>}
              {actionError && <AdminText textRole="subheadline" accessibilityRole="alert" style={styles.actionError}>{actionError}</AdminText>}
              <View style={styles.modalActions}>
                <KaelButton label={copy.actions.close} onPress={closeEditor} disabled={pending} variant="secondary" style={styles.modalAction} />
                <KaelButton label={pending ? copy.loading : editor.mode === 'nominate' ? copy.actions.nominate : copy.actions.save} onPress={() => void save()} disabled={pending} variant={editor.mode === 'revoke' ? 'secondary' : 'primary'} style={styles.modalAction} />
              </View>
            </> : null}
          </View>
        </View>
      </Modal>
    </View>
  )
}

type EditorTarget = AdminViewManagerNominationSummary | AdminViewSubAdminSummary | AdminViewSubAdminAccountCandidate
type EditorState = { mode: 'search' } | { mode: 'nominate' | 'grant' | 'update' | 'revoke'; target: EditorTarget } | null

type SubAdminState = {
  accounts: AdminViewSubAdminAccountCandidate[]
  actionError: string | null
  capabilities: AdminCapability[]
  editor: EditorState
  notice: string | null
  pending: boolean
  reason: string
  searchComplete: boolean
  searchQuery: string
  searching: boolean
}

type SubAdminAction =
  | { type: 'open_search' }
  | { type: 'open_editor'; editor: Exclude<EditorState, null | { mode: 'search' }> }
  | { type: 'close_editor' }
  | { type: 'set_search_query'; value: string }
  | { type: 'set_reason'; value: string }
  | { type: 'set_error'; error: string | null }
  | { type: 'search_start' }
  | { type: 'search_result'; accounts: AdminViewSubAdminAccountCandidate[]; error: string | null }
  | { type: 'toggle_capability'; capability: AdminCapability }
  | { type: 'pending_start' }
  | { type: 'pending_finish' }
  | { type: 'pending_failure'; error: string }
  | { type: 'save_success'; notice: string }
  | { type: 'set_notice'; notice: string }

const initialSubAdminState: SubAdminState = {
  accounts: [],
  actionError: null,
  capabilities: [],
  editor: null,
  notice: null,
  pending: false,
  reason: '',
  searchComplete: false,
  searchQuery: '',
  searching: false,
}

function subAdminReducer(state: SubAdminState, action: SubAdminAction): SubAdminState {
  switch (action.type) {
    case 'open_search':
      return { ...state, accounts: [], actionError: null, editor: { mode: 'search' }, searchComplete: false, searchQuery: '' }
    case 'open_editor':
      return {
        ...state,
        actionError: null,
        capabilities: Array.from(new Set<AdminCapability>([
          'finance.read',
          ...('capabilities' in action.editor.target ? action.editor.target.capabilities : []),
        ])),
        editor: action.editor,
        reason: '',
      }
    case 'close_editor':
      return { ...state, editor: null }
    case 'set_search_query':
      return { ...state, searchQuery: action.value }
    case 'set_reason':
      return { ...state, reason: action.value }
    case 'set_error':
      return { ...state, actionError: action.error }
    case 'search_start':
      return { ...state, actionError: null, searching: true }
    case 'search_result':
      return { ...state, accounts: action.accounts, actionError: action.error, searchComplete: true, searching: false }
    case 'toggle_capability':
      if (action.capability === 'operations.triage' && !state.capabilities.includes(action.capability)) {
        return { ...state, capabilities: Array.from(new Set([...state.capabilities, 'operations.read', 'operations.triage'])) }
      }
      if (action.capability === 'operations.read' && state.capabilities.includes(action.capability)) {
        return { ...state, capabilities: state.capabilities.filter((capability) => capability !== 'operations.read' && capability !== 'operations.triage') }
      }
      return {
        ...state,
        capabilities: state.capabilities.includes(action.capability)
          ? state.capabilities.filter((capability) => capability !== action.capability)
          : [...state.capabilities, action.capability],
      }
    case 'pending_start':
      return { ...state, actionError: null, pending: true }
    case 'pending_finish':
      return { ...state, pending: false }
    case 'pending_failure':
      return { ...state, actionError: action.error, pending: false }
    case 'save_success':
      return { ...state, editor: null, notice: action.notice }
    case 'set_notice':
      return { ...state, notice: action.notice }
  }
}

function auditActorLabel(actorName: string | null, actorRole: string, copy: OperationsCopy) {
  if (actorName === 'Owner Admin') return copy.auditRole.admin
  if (actorName === 'Sub Admin') return copy.auditRole.admin_operator
  return actorName ?? copy.auditRole[actorRole] ?? copy.unknownAuditContext
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return <View style={styles.metricRow}><AdminText textRole="subheadline" style={styles.metricLabel}>{label}</AdminText><AdminText numeric textRole="headline" style={styles.metricValue}>{value}</AdminText></View>
}

function StatusPill({ label, tone }: { label: string; tone: 'success' | 'neutral' }) {
  return <View style={[styles.statusPill, tone === 'success' && styles.statusSuccess]}><AdminText textRole="footnote" style={styles.statusText}>{label}</AdminText></View>
}

function LoadingState({ label }: { label: string }) {
  return <View style={styles.loading}><ActivityIndicator color={color.brand.primary} /><AdminText textRole="subheadline" style={styles.subtle}>{label}</AdminText></View>
}

function ErrorState({ label, onRetry, retryLabel }: { label: string; onRetry: () => void; retryLabel: string }) {
  return <View accessibilityRole="alert" style={styles.error}><AdminText textRole="subheadline" style={styles.errorText}>{label}</AdminText><KaelButton label={retryLabel} onPress={onRetry} variant="secondary" /></View>
}

function EmptyState({ label }: { label: string }) {
  return <View style={styles.empty}><AdminText textRole="subheadline" style={styles.emptyText}>{label}</AdminText></View>
}

const styles = StyleSheet.create({
  actionError: { ...typography.footnote, color: color.brand.primaryDark, marginTop: spacing.sm },
  attentionCount: { ...typography.title2, color: color.brand.primaryDeep, fontVariant: ['tabular-nums'], fontWeight: '600' },
  attentionLabel: { ...typography.body, color: color.text.strong, flex: 1, fontWeight: '600' },
  attentionRow: { alignItems: 'center', backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  auditDate: { ...typography.caption2, color: color.text.muted, maxWidth: 110, textAlign: 'right' },
  auditRow: { alignItems: 'center', borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  auditSurface: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, paddingHorizontal: spacing.lg },
  auditText: { flex: 1, gap: spacing.xs },
  auditTitle: { ...typography.label, color: color.text.strong, fontWeight: '600' },
  blockTitle: { ...typography.headline, color: color.text.strong, fontWeight: '600', marginTop: spacing.sm },
  capabilityPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  capabilityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  capabilityText: { ...typography.caption2, color: color.brand.primaryDark, fontWeight: '600' },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  empty: { alignItems: 'center', backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, padding: spacing.xxl },
  emptyText: { ...typography.body, color: color.text.secondary, textAlign: 'center' },
  error: { alignItems: 'center', backgroundColor: color.surface.mint, borderColor: color.surface.strokeStrong, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  errorText: { ...typography.body, color: color.brand.primaryDark, textAlign: 'center' },
  loading: { alignItems: 'center', gap: spacing.md, padding: spacing.xxxl },
  memberAction: { flex: 1 },
  memberActions: { flexDirection: 'row', gap: spacing.sm },
  memberCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  memberName: { ...typography.headline, color: color.text.strong, fontWeight: '600' },
  memberTitleBlock: { flex: 1, gap: spacing.xs },
  metricLabel: { ...typography.footnote, color: color.text.secondary, flex: 1 },
  metricRow: { alignItems: 'center', borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  metricSurface: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, paddingHorizontal: spacing.lg, ...shadow.soft },
  metricValue: { ...typography.headline, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '600' },
  modalAction: { flex: 1 },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(15, 48, 47, 0.36)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.largeRadius, borderWidth: 1, gap: spacing.md, maxWidth: 560, padding: spacing.xl, width: '100%', ...shadow.soft },
  modalSubtitle: { ...typography.body, color: color.text.secondary },
  modalTitle: { ...typography.title2, color: color.text.strong, fontWeight: '600' },
  notice: { backgroundColor: component.chip.successStatus.bg, borderColor: component.chip.successStatus.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  noticeText: { ...typography.footnote, color: component.chip.successStatus.text },
  ownerOnly: { ...typography.footnote, color: color.text.secondary },
  searchResult: { borderColor: color.surface.stroke, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md },
  sectionHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  sectionHeaderText: { flex: 1, gap: spacing.xs },
  sectionTitle: { ...typography.title2, color: color.text.strong, fontWeight: '600' },
  stack: { gap: spacing.lg },
  statusPill: { backgroundColor: color.surface.disabled, borderColor: color.surface.stroke, borderRadius: component.chip.radius, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusSuccess: { backgroundColor: component.chip.successStatus.bg, borderColor: component.chip.successStatus.border },
  statusText: { ...typography.caption2, color: color.text.strong, fontWeight: '600' },
  subtle: { ...typography.footnote, color: color.text.secondary },
})
