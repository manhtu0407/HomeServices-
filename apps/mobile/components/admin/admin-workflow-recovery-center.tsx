import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, spacing, typography } from '@/design/theme'
import type {
  AdminViewActor,
  AdminViewWorkflowRecoveryActionInput,
  AdminViewWorkflowRecoveryDetailResponse,
  AdminViewWorkflowRecoverySummary,
} from '@/lib/api-types/admin'
import { localizedStatusLabel, type AppLanguage } from '@/lib/app-language'
import {
  clearStableClientRequestId,
  shouldRetainClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from '@/lib/client-request-id'
import { adminControlService } from '@/lib/services'

import { AdminText } from './admin-text'

type RecoveryAction = AdminViewWorkflowRecoveryActionInput['action']
type RecoveryHistoryAction = AdminViewWorkflowRecoveryDetailResponse['actions'][number]['action']

const USER_ACTIONS = [
  'acknowledge',
  'mark_contact_required',
  'reconcile_capacity',
  'resolve_verified',
] as const satisfies readonly RecoveryAction[]

const copy = {
  vi: {
    action: {
      acknowledge: 'Đã tiếp nhận',
      mark_contact_required: 'Cần liên hệ hai bên',
      reconcile_capacity: 'Đối soát giữ chỗ',
      resolve_verified: 'Đóng sau khi xác minh',
      system_recovered: 'Hệ thống ghi nhận đã phục hồi',
    },
    activeReservations: 'Giữ chỗ còn hiệu lực',
    affectedReservations: 'Số giữ chỗ đã xử lý',
    back: 'Quay lại danh sách',
    close: 'Đóng ca phục hồi',
    empty: 'Không có quy trình nào đang cần phục hồi.',
    error: 'Không thể tải ca phục hồi lúc này.',
    history: 'Lịch sử hành động',
    lastActivity: 'Hoạt động gần nhất',
    loading: 'Đang tải ca phục hồi…',
    noHistory: 'Chưa có hành động quản trị.',
    reason: 'Lý do xử lý (không ghi dữ liệu nhạy cảm)',
    reasonCode: {
      ARRIVAL_STUCK: 'Thợ đã đến nhưng quy trình không tiếp tục',
      BROADCASTING_STUCK: 'Quá trình gửi lời mời bị mắc kẹt',
      CANDIDATE_DECISION_STUCK: 'Bước chọn thợ bị mắc kẹt',
      COMPLETION_CONFIRMATION_STUCK: 'Đang chờ khách xác nhận hoàn tất quá lâu',
      INSPECTION_STUCK: 'Bước khảo sát bị mắc kẹt',
      MATCHING_RECOVERY_STUCK: 'Quá trình ghép thợ cần phục hồi',
      PAYMENT_RECONCILIATION_STUCK: 'Đối soát thanh toán bị mắc kẹt',
      PAYMENT_SETUP_STUCK: 'Bước tạo lệnh thanh toán bị mắc kẹt',
      SCOPE_CHANGE_STUCK: 'Bước duyệt thay đổi phạm vi bị mắc kẹt',
      WORKER_ON_WAY_STUCK: 'Thợ đang di chuyển quá lâu',
      WORK_STUCK: 'Công việc đang thực hiện quá lâu',
    },
    reasonRequired: 'Nhập lý do từ 3 ký tự trước khi tiếp tục.',
    retry: 'Thử lại',
    state: 'Trạng thái được phát hiện',
    status: {
      acknowledged: 'Đã tiếp nhận',
      action_required: 'Cần xử lý',
      open: 'Đang mở',
      resolved: 'Đã giải quyết',
    },
    title: 'Phục hồi quy trình',
    triageRequired: 'Tài khoản này chỉ có quyền xem. Cần quyền xử lý vận hành để thao tác.',
    versionConflict: 'Ca này vừa được cập nhật. Dữ liệu đã được tải lại.',
  },
  en: {
    action: {
      acknowledge: 'Acknowledge',
      mark_contact_required: 'Contact both parties',
      reconcile_capacity: 'Reconcile reservations',
      resolve_verified: 'Resolve after verification',
      system_recovered: 'System recorded recovery',
    },
    activeReservations: 'Active reservations',
    affectedReservations: 'Reservations reconciled',
    back: 'Back to list',
    close: 'Close recovery cases',
    empty: 'No workflow currently requires recovery.',
    error: 'Recovery cases are unavailable right now.',
    history: 'Action history',
    lastActivity: 'Last activity',
    loading: 'Loading recovery cases…',
    noHistory: 'No administrative action has been recorded.',
    reason: 'Action reason (exclude sensitive data)',
    reasonCode: {
      ARRIVAL_STUCK: 'Worker arrival did not advance',
      BROADCASTING_STUCK: 'Offer broadcast is stuck',
      CANDIDATE_DECISION_STUCK: 'Worker selection is stuck',
      COMPLETION_CONFIRMATION_STUCK: 'Customer completion confirmation is overdue',
      INSPECTION_STUCK: 'Inspection is stuck',
      MATCHING_RECOVERY_STUCK: 'Matching requires recovery',
      PAYMENT_RECONCILIATION_STUCK: 'Payment reconciliation is stuck',
      PAYMENT_SETUP_STUCK: 'Payment-order setup is stuck',
      SCOPE_CHANGE_STUCK: 'Scope-change decision is stuck',
      WORKER_ON_WAY_STUCK: 'Worker travel is overdue',
      WORK_STUCK: 'Work has remained active too long',
    },
    reasonRequired: 'Enter a reason of at least 3 characters before continuing.',
    retry: 'Retry',
    state: 'Detected state',
    status: {
      acknowledged: 'Acknowledged',
      action_required: 'Action required',
      open: 'Open',
      resolved: 'Resolved',
    },
    title: 'Workflow recovery',
    triageRequired: 'This account has read-only access. Operations triage permission is required to act.',
    versionConflict: 'This case changed. The latest state has been loaded.',
  },
} as const

export function AdminWorkflowRecoveryCenter({
  actor,
  language,
  onClose,
}: {
  actor: AdminViewActor
  language: AppLanguage
  onClose: () => void
}) {
  const strings = copy[language]
  const [records, setRecords] = useState<AdminViewWorkflowRecoverySummary[]>([])
  const [detail, setDetail] = useState<AdminViewWorkflowRecoveryDetailResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<RecoveryAction | null>(null)
  const [reason, setReason] = useState('')
  const requestId = useRef<PendingClientRequestId | null>(null)
  const canTriage = actor.access_level === 'owner' || actor.capabilities.includes('operations.triage')

  const loadList = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await adminControlService.listWorkflowRecoveryCases({ status: 'all', limit: 50 })
    if (!result.success) {
      setError(strings.error)
      setLoading(false)
      return
    }
    setRecords(result.data.records)
    setLoading(false)
  }, [strings.error])

  const loadDetail = useCallback(async (recoveryCaseId: string) => {
    setLoading(true)
    setError(null)
    const result = await adminControlService.getWorkflowRecoveryCase(recoveryCaseId)
    if (!result.success) {
      setError(strings.error)
      setLoading(false)
      return
    }
    setDetail(result.data)
    setLoading(false)
  }, [strings.error])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const applyAction = async (action: RecoveryAction) => {
    if (!detail || pendingAction || !canTriage) return
    const normalizedReason = reason.trim()
    if (normalizedReason.length < 3) {
      setError(strings.reasonRequired)
      return
    }
    const fingerprint = `${detail.summary.recovery_case_id}:${detail.summary.version}:${action}:${normalizedReason}`
    const idempotencyKey = stableClientRequestId(requestId, fingerprint)
    setPendingAction(action)
    setError(null)
    const result = await adminControlService.applyWorkflowRecoveryAction(
      detail.summary.recovery_case_id,
      {
        action,
        reason: normalizedReason,
        idempotency_key: idempotencyKey,
        expected_version: detail.summary.version,
      },
    )
    setPendingAction(null)
    if (!result.success) {
      if (!shouldRetainClientRequestId(result)) clearStableClientRequestId(requestId, fingerprint)
      setError(result.code === 'CONFLICT' ? strings.versionConflict : strings.error)
      await loadDetail(detail.summary.recovery_case_id)
      return
    }
    clearStableClientRequestId(requestId, fingerprint)
    setReason('')
    await Promise.all([loadList(), loadDetail(detail.summary.recovery_case_id)])
  }

  if (loading && records.length === 0 && !detail) {
    return <View style={styles.feedback}><ActivityIndicator color={color.brand.primary} /><AdminText textRole="subheadline" style={styles.muted}>{strings.loading}</AdminText></View>
  }

  return (
    <View testID="admin-workflow-recovery-center" style={styles.stack}>
      <View style={styles.header}>
        <AdminText textRole="title2" style={styles.title}>{strings.title}</AdminText>
        <KaelButton label={detail ? strings.back : strings.close} onPress={() => detail ? setDetail(null) : onClose()} variant="secondary" />
      </View>

      {error ? <View accessibilityRole="alert" style={styles.error}><AdminText textRole="subheadline" style={styles.errorText}>{error}</AdminText><KaelButton label={strings.retry} onPress={() => detail ? void loadDetail(detail.summary.recovery_case_id) : void loadList()} variant="secondary" /></View> : null}

      {detail ? (
        <View style={styles.stack}>
          <RecoverySummaryCard language={language} summary={detail.summary} />
          <View style={styles.metricCard}>
            <Metric label={strings.state} value={localizedStatusLabel(detail.current_job_status, language)} />
            <Metric label={strings.activeReservations} value={String(detail.active_capacity_reservations)} />
          </View>

          {!canTriage ? <AdminText textRole="subheadline" style={styles.muted}>{strings.triageRequired}</AdminText> : detail.summary.status !== 'resolved' ? <>
            <KaelTextField
              accessibilityLabel={strings.reason}
              multiline
              onChangeText={setReason}
              placeholder={strings.reason}
              placeholderTextColor={color.text.muted}
              value={reason}
            />
            <View style={styles.actions}>
              {USER_ACTIONS.map((action) => (
                <KaelButton
                  key={action}
                  disabled={pendingAction !== null}
                  label={pendingAction === action ? strings.loading : strings.action[action]}
                  onPress={() => void applyAction(action)}
                  variant={action === 'resolve_verified' ? 'primary' : 'secondary'}
                  style={styles.action}
                />
              ))}
            </View>
          </> : null}

          <AdminText textRole="headline" style={styles.blockTitle}>{strings.history}</AdminText>
          {detail.actions.length === 0 ? <AdminText textRole="subheadline" style={styles.muted}>{strings.noHistory}</AdminText> : detail.actions.map((action) => (
            <View key={`${action.created_at}:${action.case_version}`} style={styles.historyRow}>
              <AdminText textRole="headline" style={styles.historyTitle}>{strings.action[action.action as RecoveryHistoryAction]}</AdminText>
              <AdminText textRole="footnote" style={styles.muted}>{action.reason}</AdminText>
              <AdminText textRole="footnote" style={styles.muted}>{strings.affectedReservations}: {action.affected_reservation_count}</AdminText>
            </View>
          ))}
        </View>
      ) : records.length === 0 ? (
        <AdminText textRole="subheadline" style={styles.muted}>{strings.empty}</AdminText>
      ) : (
        records.map((record) => (
          <Pressable
            key={record.recovery_case_id}
            accessibilityRole="button"
            accessibilityLabel={`${record.display_code}: ${localizeReason(record.reason_code, language)}`}
            onPress={() => void loadDetail(record.recovery_case_id)}
            style={styles.caseCard}
            testID={`admin-workflow-recovery-${record.recovery_case_id}`}
          >
            <RecoverySummaryCard language={language} summary={record} />
          </Pressable>
        ))
      )}
    </View>
  )
}

function RecoverySummaryCard({ language, summary }: { language: AppLanguage; summary: AdminViewWorkflowRecoverySummary }) {
  const strings = copy[language]
  return <View style={styles.summary}>
    <View style={styles.summaryHeader}>
      <AdminText textRole="headline" style={styles.caseCode}>{summary.display_code}</AdminText>
      <AdminText textRole="footnote" style={styles.status}>{strings.status[summary.status]}</AdminText>
    </View>
    <AdminText textRole="subheadline" style={styles.reasonCode}>{localizeReason(summary.reason_code, language)}</AdminText>
    <AdminText textRole="footnote" style={styles.muted}>{strings.state}: {localizeDetectedState(summary.detected_state, language)}</AdminText>
    <AdminText textRole="footnote" style={styles.muted}>{strings.lastActivity}: {new Date(summary.last_activity_at).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}</AdminText>
  </View>
}

function localizeReason(reasonCode: string, language: AppLanguage) {
  const reasons = copy[language].reasonCode as Record<string, string>
  return reasons[reasonCode] ?? (language === 'vi' ? 'Cần kiểm tra quy trình' : 'Workflow review required')
}

function localizeDetectedState(state: string, language: AppLanguage) {
  if (state === 'matching_recovery_required') {
    return language === 'vi' ? 'Ghép thợ cần phục hồi' : 'Matching recovery required'
  }
  const known = [
    'draft', 'analyzing', 'estimate_ready', 'awaiting_customer_confirm', 'broadcasting',
    'worker_candidate_pending', 'worker_matched', 'worker_on_way', 'arrived', 'inspecting',
    'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer',
    'payment_pending', 'paid', 'reviewed', 'cancelled',
  ] as const
  if ((known as readonly string[]).includes(state)) {
    return localizedStatusLabel(state as (typeof known)[number], language)
  }
  return language === 'vi' ? 'Chưa xác định' : 'Unknown'
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><AdminText textRole="footnote" style={styles.muted}>{label}</AdminText><AdminText textRole="headline" style={styles.metricValue}>{value}</AdminText></View>
}

const styles = StyleSheet.create({
  action: { flexGrow: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  blockTitle: { ...typography.headline, color: color.text.strong, marginTop: spacing.sm },
  caseCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, padding: spacing.lg },
  caseCode: { ...typography.headline, color: color.text.strong, fontWeight: '600' },
  error: { alignItems: 'center', backgroundColor: color.surface.mint, borderColor: color.surface.strokeStrong, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  errorText: { ...typography.body, color: color.brand.primaryDark, textAlign: 'center' },
  feedback: { alignItems: 'center', gap: spacing.md, padding: spacing.xl },
  header: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  historyRow: { borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingVertical: spacing.md },
  historyTitle: { ...typography.label, color: color.text.strong },
  metric: { flex: 1, gap: spacing.xs },
  metricCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  metricValue: { ...typography.headline, color: color.text.strong },
  muted: { ...typography.footnote, color: color.text.secondary },
  reasonCode: { ...typography.label, color: color.brand.primaryDark, fontWeight: '600' },
  stack: { gap: spacing.lg },
  status: { ...typography.caption2, color: color.brand.primaryDark, fontWeight: '600' },
  summary: { gap: spacing.xs },
  summaryHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  title: { ...typography.title2, color: color.text.strong, fontWeight: '600' },
})
