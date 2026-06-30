import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { KaelTextField } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import { useAuth } from '@/lib/auth-provider'
import { adminLearningService } from '@/lib/services'
import type { KaelLearningCandidateSummary } from '@/lib/api-types'

type PendingAction = {
  candidateId: string
  action: 'approve' | 'reject'
} | null

const MANUAL_REVIEW_SLA_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

export default function AdminDashboard() {
  const { replace } = useRouter()
  const { signOut } = useAuth()
  const [candidates, setCandidates] = useState<KaelLearningCandidateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({})

  const manualCount = useMemo(() => candidates.length, [candidates.length])

  const loadCandidates = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await adminLearningService.listCandidates('manual_review')
    if (result.success) {
      setCandidates(result.data.candidates)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    adminLearningService.listCandidates('manual_review').then((result) => {
      if (!active) return
      if (result.success) {
        setCandidates(result.data.candidates)
        setError(null)
      } else {
        setError(result.error)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  async function approveCandidate(candidateId: string) {
    setPendingAction({ candidateId, action: 'approve' })
    setNotice(null)
    const result = await adminLearningService.approveCandidate(candidateId)
    if (result.success) {
      setNotice('Đã duyệt đề xuất học của Kael.')
      await loadCandidates()
    } else {
      setError(result.error)
    }
    setPendingAction(null)
  }

  async function rejectCandidate(candidateId: string) {
    const reason = rejectReasons[candidateId]?.trim()
    if (!reason) {
      setError('Nhập lý do từ chối trước khi lưu quyết định.')
      return
    }
    setPendingAction({ candidateId, action: 'reject' })
    setNotice(null)
    const result = await adminLearningService.rejectCandidate(candidateId, { reason })
    if (result.success) {
      setNotice('Đã từ chối và lưu trữ đề xuất học của Kael.')
      setRejectReasons((current) => {
        const next = { ...current }
        delete next[candidateId]
        return next
      })
      await loadCandidates()
    } else {
      setError(result.error)
    }
    setPendingAction(null)
  }

  return (
    <ScrollView contentContainerStyle={styles.container} testID="admin-dashboard">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Quản trị Kael</Text>
        <Text style={styles.title}>Duyệt đề xuất học</Text>
        <Text style={styles.subtitle}>
          Chỉ các đề xuất cần người duyệt mới xuất hiện ở đây. Mọi quyết định được ghi audit ở Edge.
        </Text>
        <View style={styles.headerMeta}>
          <Text style={styles.metaText}>{manualCount} đề xuất chờ duyệt</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadCandidates()}
            style={styles.refreshButton}
            testID="admin-learning-refresh"
          >
            <Text style={styles.refreshText}>Tải lại</Text>
          </Pressable>
        </View>
      </View>

      {notice ? <Text style={styles.notice} testID="admin-learning-notice">{notice}</Text> : null}
      {error ? <Text style={styles.error} testID="admin-learning-error">{error}</Text> : null}

      {loading ? (
        <View style={styles.stateBox} testID="admin-learning-loading">
          <ActivityIndicator />
          <Text style={styles.stateText}>Đang tải danh sách duyệt...</Text>
        </View>
      ) : candidates.length === 0 ? (
        <View style={styles.stateBox} testID="admin-learning-empty">
          <Text style={styles.stateTitle}>Không có đề xuất cần duyệt</Text>
          <Text style={styles.stateText}>Kael sẽ hiển thị đề xuất mới sau khi batch learning tạo bằng chứng hợp lệ.</Text>
        </View>
      ) : (
        <View style={styles.list} testID="admin-learning-list">
          {candidates.map((candidate) => {
            const reason = rejectReasons[candidate.id] ?? ''
            const approving = pendingAction?.candidateId === candidate.id && pendingAction.action === 'approve'
            const rejecting = pendingAction?.candidateId === candidate.id && pendingAction.action === 'reject'
            const disabled = pendingAction !== null
            const slaOverdue = isManualReviewSlaOverdue(candidate.created_at)
            return (
              <View key={candidate.id} style={styles.candidateRow} testID={`admin-learning-candidate-${candidate.id}`}>
                <View style={styles.rowHeader}>
                  <View>
                    <Text style={styles.candidateTitle}>{candidateTypeLabel(candidate.candidate_type)}</Text>
                    <Text style={styles.candidateMeta}>{candidateSkill(candidate)} · {serviceLabel(candidate.affected_service)}</Text>
                  </View>
                  <View style={styles.statusStack}>
                    <Text style={styles.statusPill}>Chờ duyệt</Text>
                    {slaOverdue ? <Text style={styles.slaWarning}>Quá hạn {MANUAL_REVIEW_SLA_DAYS} ngày</Text> : null}
                  </View>
                </View>

                <View style={styles.metrics}>
                  <Metric label="Bằng chứng" value={`${candidate.evidence_count}`} />
                  <Metric label="Tin cậy" value={formatPercent(candidate.confidence)} />
                  <Metric label="Khu vực" value={candidate.affected_district ?? 'Không giới hạn'} />
                </View>

                <Text style={styles.detailText}>Mã vấn đề: {candidate.affected_problem ?? 'Không giới hạn'}</Text>
                <Text style={styles.detailText}>Nguồn: {evidenceSource(candidate)}</Text>

                <KaelTextField
                  accessibilityLabel="Lý do từ chối"
                  inputShellStyle={styles.reasonInputShell}
                  onChangeText={(text) => setRejectReasons((current) => ({ ...current, [candidate.id]: text }))}
                  placeholder="Lý do từ chối"
                  placeholderTextColor="#7A8B85"
                  style={styles.reasonInputText}
                  testID={`admin-learning-reason-${candidate.id}`}
                  value={reason}
                />

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => void approveCandidate(candidate.id)}
                    style={[styles.actionButton, disabled ? styles.disabledButton : null]}
                    testID={`admin-learning-approve-${candidate.id}`}
                  >
                    <Text style={styles.actionText}>{approving ? 'Đang duyệt...' : 'Duyệt'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => void rejectCandidate(candidate.id)}
                    style={[styles.actionButton, styles.rejectButton, disabled ? styles.disabledButton : null]}
                    testID={`admin-learning-reject-${candidate.id}`}
                  >
                    <Text style={styles.rejectText}>{rejecting ? 'Đang lưu...' : 'Từ chối'}</Text>
                  </Pressable>
                </View>
              </View>
            )
          })}
        </View>
      )}

      <View style={styles.accountActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => replace('/(auth)/login')}
          style={styles.accountButton}
          testID="admin-shell-switch-account"
        >
          <Text style={styles.accountButtonText}>Đổi tài khoản</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut?.()}
          style={[styles.accountButton, styles.secondaryButton]}
          testID="admin-shell-sign-out"
        >
          <Text style={styles.accountButtonText}>Đăng xuất</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  )
}

function candidateTypeLabel(type: string) {
  return ({
    price_prior_update: 'Cập nhật khoảng giá',
    analysis_rule: 'Quy tắc phân tích',
    service_knowledge_candidate: 'Tri thức dịch vụ',
    safety_pattern_candidate: 'Mẫu an toàn',
    decline_reason_candidate: 'Lý do từ chối',
  } as Record<string, string>)[type] ?? 'Đề xuất học'
}

function serviceLabel(service: KaelLearningCandidateSummary['affected_service']) {
  if (service === 'electrical') return 'Sửa điện'
  if (service === 'plumbing') return 'Sửa nước'
  if (service === 'cleaning') return 'Vệ sinh nhà'
  return 'Toàn hệ thống'
}

function candidateSkill(candidate: KaelLearningCandidateSummary) {
  const skill = candidate.suggested_payload.skill_id
  return typeof skill === 'string' ? skill : 'Kael'
}

function evidenceSource(candidate: KaelLearningCandidateSummary) {
  const source = candidate.evidence_snapshot?.source ?? candidate.suggested_payload.evidence_source
  if (source === 'completed_reviewed_jobs') return 'Việc đã hoàn tất và được đánh giá'
  if (source === 'candidate_payload') return 'Payload đề xuất đã kiểm tra'
  if (source === 'learning_rule_monitor') return 'Giám sát quy tắc học'
  return 'Bằng chứng đã lưu'
}

function isManualReviewSlaOverdue(createdAt: string) {
  const createdMs = Date.parse(createdAt)
  return Number.isFinite(createdMs) && Date.now() - createdMs > MANUAL_REVIEW_SLA_DAYS * DAY_MS
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

const styles = StyleSheet.create({
  accountActions: { flexDirection: 'row', gap: 10 },
  accountButton: {
    alignItems: 'center',
    backgroundColor: '#256B47',
    borderRadius: 14,
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  accountButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  actionButton: {
    alignItems: 'center',
    backgroundColor: '#0E7C66',
    borderRadius: 12,
    flex: 1,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionText: { color: '#FFFFFF', fontFamily: typography.fontFamily, fontSize: 14, fontWeight: typography.label.fontWeight },
  actions: { flexDirection: 'row', gap: 10 },
  candidateMeta: { color: '#52615C', fontSize: 13, marginTop: 4 },
  candidateRow: {
    backgroundColor: '#FFFDF8',
    borderColor: '#D8E8E1',
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  candidateTitle: { color: '#0E2F2A', fontFamily: typography.fontFamily, fontSize: 16, fontWeight: typography.h3.fontWeight },
  container: { backgroundColor: '#F6FBF8', gap: 16, padding: 20 },
  detailText: { color: '#52615C', fontSize: 13, lineHeight: 19 },
  disabledButton: { opacity: 0.52 },
  error: {
    backgroundColor: '#FDE8E8',
    borderColor: '#F7B4B4',
    borderRadius: 14,
    borderWidth: 1,
    color: '#8A1F1F',
    fontSize: 13,
    fontWeight: '700',
    padding: 12,
  },
  eyebrow: { color: '#0E7C66', fontFamily: typography.fontFamily, fontSize: 12, fontWeight: typography.caption.fontWeight, letterSpacing: 0, textTransform: 'uppercase' },
  header: {
    backgroundColor: '#EAF8F3',
    borderColor: '#B9E6D8',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  headerMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  list: { gap: 12 },
  metaText: { color: '#1D4D43', flex: 1, fontSize: 13, fontWeight: '700' },
  metric: { backgroundColor: '#EEF7F3', borderRadius: 12, flex: 1, gap: 3, padding: 10 },
  metricLabel: { color: '#60736D', fontSize: 11, fontWeight: '700' },
  metrics: { flexDirection: 'row', gap: 8 },
  metricValue: { color: '#0E2F2A', fontFamily: typography.fontFamily, fontSize: 14, fontWeight: typography.label.fontWeight },
  notice: {
    backgroundColor: '#E9F8EF',
    borderColor: '#A8DEB7',
    borderRadius: 14,
    borderWidth: 1,
    color: '#155B35',
    fontSize: 13,
    fontWeight: '700',
    padding: 12,
  },
  reasonInputShell: {
    backgroundColor: '#FFFFFF',
    borderColor: '#C7DCD4',
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  reasonInputText: {
    color: '#0E2F2A',
    fontSize: 14,
    fontWeight: '500',
    minHeight: 42,
  },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#B9E6D8',
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  refreshText: { color: '#0E7C66', fontFamily: typography.fontFamily, fontSize: 13, fontWeight: typography.label.fontWeight },
  rejectButton: { backgroundColor: '#FFFFFF', borderColor: '#C93A3A', borderWidth: 1 },
  rejectText: { color: '#A42727', fontFamily: typography.fontFamily, fontSize: 14, fontWeight: typography.label.fontWeight },
  rowHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  secondaryButton: { backgroundColor: '#52615C' },
  slaWarning: { color: '#9A5A00', fontFamily: typography.fontFamily, fontSize: 11, fontWeight: typography.caption.fontWeight, textAlign: 'right' },
  stateBox: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderColor: '#D8E8E1',
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  stateText: { color: '#52615C', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  stateTitle: { color: '#0E2F2A', fontFamily: typography.fontFamily, fontSize: 15, fontWeight: typography.h3.fontWeight },
  statusPill: {
    backgroundColor: '#FFE9B0',
    borderRadius: 999,
    color: '#5C3C00',
    fontSize: 12,
    fontFamily: typography.fontFamily,
    fontWeight: typography.caption.fontWeight,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusStack: { alignItems: 'flex-end', gap: 5 },
  subtitle: { color: '#52615C', fontSize: 14, lineHeight: 20 },
  title: { color: '#0E2F2A', fontFamily: typography.fontFamily, fontSize: 24, fontWeight: typography.h2.fontWeight },
})
