import { useCallback, useEffect, useReducer, useRef } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { KaelTextField } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { adminLearningService } from '@/lib/services'
import type { KaelLearningCandidateSummary } from '@/lib/api-types'

type PendingAction = {
  candidateId: string
  action: 'approve' | 'reject'
  requestId: number
} | null

type AdminDashboardErrorKey = 'approveFailed' | 'loadFailed' | 'rejectFailed' | 'rejectReasonRequired'
type AdminDashboardNoticeKey = 'approved' | 'rejected'

type AdminDashboardCopy = {
  actions: {
    approve: string
    approving: string
    refresh: string
    reject: string
    rejecting: string
    signOut: string
    switchAccount: string
  }
  candidateTypes: {
    analysisRule: string
    declineReason: string
    fallback: string
    pricePriorUpdate: string
    safetyPattern: string
    serviceKnowledge: string
  }
  detail: { problem: string; source: string }
  empty: { body: string; title: string }
  errors: Record<AdminDashboardErrorKey, string>
  evidenceSources: {
    candidatePayload: string
    completedReviewedJobs: string
    fallback: string
    learningRuleMonitor: string
  }
  eyebrow: string
  loading: string
  metrics: { area: string; confidence: string; evidence: string }
  notices: Record<AdminDashboardNoticeKey, string>
  pendingCount: (count: number) => string
  pendingCountLoading: string
  pendingCountUnavailable: string
  reasonPlaceholder: string
  scopeAny: string
  services: {
    cleaning: string
    electrical: string
    handyman: string
    hvac: string
    plumbing: string
    systemWide: string
    upholstery: string
  }
  slaOverdue: (days: number) => string
  statusPending: string
  subtitle: string
  title: string
}

const adminDashboardCopy: Record<AppLanguage, AdminDashboardCopy> = {
  vi: {
    actions: {
      approve: 'Duyệt',
      approving: 'Đang duyệt...',
      refresh: 'Tải lại',
      reject: 'Từ chối',
      rejecting: 'Đang lưu...',
      signOut: 'Đăng xuất',
      switchAccount: 'Đổi tài khoản',
    },
    candidateTypes: {
      analysisRule: 'Quy tắc phân tích',
      declineReason: 'Lý do từ chối',
      fallback: 'Đề xuất học',
      pricePriorUpdate: 'Cập nhật khoảng giá',
      safetyPattern: 'Mẫu an toàn',
      serviceKnowledge: 'Tri thức dịch vụ',
    },
    detail: { problem: 'Mã vấn đề', source: 'Nguồn' },
    empty: {
      body: 'Kael sẽ hiển thị đề xuất mới sau khi đợt học tạo ra bằng chứng hợp lệ.',
      title: 'Không có đề xuất cần duyệt',
    },
    errors: {
      approveFailed: 'Không thể duyệt đề xuất lúc này. Vui lòng thử lại.',
      loadFailed: 'Không thể tải danh sách duyệt lúc này. Vui lòng thử lại.',
      rejectFailed: 'Không thể từ chối đề xuất lúc này. Vui lòng thử lại.',
      rejectReasonRequired: 'Nhập lý do từ chối trước khi lưu quyết định.',
    },
    evidenceSources: {
      candidatePayload: 'Dữ liệu đề xuất đã kiểm tra',
      completedReviewedJobs: 'Việc đã hoàn tất và được đánh giá',
      fallback: 'Bằng chứng đã lưu',
      learningRuleMonitor: 'Giám sát quy tắc học',
    },
    eyebrow: 'Quản trị Kael',
    loading: 'Đang tải danh sách duyệt...',
    metrics: { area: 'Khu vực', confidence: 'Tin cậy', evidence: 'Bằng chứng' },
    notices: {
      approved: 'Đã duyệt đề xuất học của Kael.',
      rejected: 'Đã từ chối và lưu trữ đề xuất học của Kael.',
    },
    pendingCount: (count) => `${count} đề xuất chờ duyệt`,
    pendingCountLoading: 'Đang tải số đề xuất...',
    pendingCountUnavailable: 'Chưa có số liệu duyệt',
    reasonPlaceholder: 'Lý do từ chối',
    scopeAny: 'Không giới hạn',
    services: {
      cleaning: 'Vệ sinh nhà',
      electrical: 'Sửa điện',
      handyman: 'Sửa chữa nhỏ và lắp đặt',
      hvac: 'Điều hòa và không khí trong nhà',
      plumbing: 'Sửa nước',
      systemWide: 'Toàn hệ thống',
      upholstery: 'Chăm sóc sofa và đồ vải',
    },
    slaOverdue: (days) => `Quá thời hạn duyệt ${days} ngày`,
    statusPending: 'Chờ duyệt',
    subtitle: 'Chỉ các đề xuất cần người duyệt mới xuất hiện ở đây. Mọi quyết định đều được ghi vào nhật ký kiểm tra của hệ thống.',
    title: 'Duyệt đề xuất học',
  },
  en: {
    actions: {
      approve: 'Approve',
      approving: 'Approving...',
      refresh: 'Refresh',
      reject: 'Reject',
      rejecting: 'Saving...',
      signOut: 'Sign out',
      switchAccount: 'Switch account',
    },
    candidateTypes: {
      analysisRule: 'Analysis rule',
      declineReason: 'Decline reason',
      fallback: 'Learning proposal',
      pricePriorUpdate: 'Price range update',
      safetyPattern: 'Safety pattern',
      serviceKnowledge: 'Service knowledge',
    },
    detail: { problem: 'Problem code', source: 'Source' },
    empty: {
      body: 'Kael will show new proposals after the learning batch produces valid evidence.',
      title: 'No proposals need review',
    },
    errors: {
      approveFailed: 'Unable to approve this proposal right now. Please try again.',
      loadFailed: 'Unable to load the review queue right now. Please try again.',
      rejectFailed: 'Unable to reject this proposal right now. Please try again.',
      rejectReasonRequired: 'Enter a rejection reason before saving this decision.',
    },
    evidenceSources: {
      candidatePayload: 'Validated proposal payload',
      completedReviewedJobs: 'Completed and reviewed jobs',
      fallback: 'Saved evidence',
      learningRuleMonitor: 'Learning rule monitor',
    },
    eyebrow: 'Kael administration',
    loading: 'Loading the review queue...',
    metrics: { area: 'Area', confidence: 'Confidence', evidence: 'Evidence' },
    notices: {
      approved: "Kael's learning proposal was approved.",
      rejected: "Kael's learning proposal was rejected and archived.",
    },
    pendingCount: (count) => `${count} learning ${count === 1 ? 'proposal' : 'proposals'} awaiting review`,
    pendingCountLoading: 'Loading review count...',
    pendingCountUnavailable: 'Review count unavailable',
    reasonPlaceholder: 'Rejection reason',
    scopeAny: 'No restriction',
    services: {
      cleaning: 'Home cleaning',
      electrical: 'Electrical repair',
      handyman: 'Minor repair and installation',
      hvac: 'Air conditioning and indoor air',
      plumbing: 'Plumbing repair',
      systemWide: 'System-wide',
      upholstery: 'Sofa and fabric care',
    },
    slaOverdue: (days) => `Past the ${days}-day review window`,
    statusPending: 'Awaiting review',
    subtitle: 'Only proposals requiring manual review appear here. Every decision is recorded in the Edge audit log.',
    title: 'Review learning proposals',
  },
}

type AdminDashboardState = {
  activeLoadRequestId: number
  candidates: KaelLearningCandidateSummary[]
  error: AdminDashboardErrorKey | null
  hasLoadedCandidates: boolean
  loading: boolean
  notice: AdminDashboardNoticeKey | null
  pendingAction: PendingAction
  rejectReasons: Record<string, string>
}

type AdminDashboardAction =
  | { type: 'loadStarted'; requestId: number }
  | { type: 'loadSucceeded'; candidates: KaelLearningCandidateSummary[]; requestId: number }
  | { type: 'loadFailed'; error: 'loadFailed'; requestId: number }
  | { type: 'actionStarted'; pendingAction: Exclude<PendingAction, null> }
  | { type: 'actionSucceeded'; clearRejectReasonFor?: string; notice: AdminDashboardNoticeKey; requestId: number }
  | { type: 'actionFailed'; error: 'approveFailed' | 'rejectFailed'; requestId: number }
  | { type: 'actionFinished'; requestId: number }
  | { type: 'rejectReasonChanged'; candidateId: string; text: string }
  | { type: 'validationFailed'; error: 'rejectReasonRequired' }

const initialAdminDashboardState: AdminDashboardState = {
  activeLoadRequestId: 0,
  candidates: [],
  error: null,
  hasLoadedCandidates: false,
  loading: true,
  notice: null,
  pendingAction: null,
  rejectReasons: {},
}

function adminDashboardReducer(
  state: AdminDashboardState,
  action: AdminDashboardAction,
): AdminDashboardState {
  switch (action.type) {
    case 'loadStarted':
      return {
        ...state,
        activeLoadRequestId: action.requestId,
        error: null,
        loading: true,
      }
    case 'loadSucceeded':
      if (state.activeLoadRequestId !== action.requestId) return state
      return {
        ...state,
        candidates: action.candidates,
        error: null,
        hasLoadedCandidates: true,
        loading: false,
      }
    case 'loadFailed':
      if (state.activeLoadRequestId !== action.requestId) return state
      return { ...state, error: action.error, loading: false }
    case 'actionStarted':
      return { ...state, error: null, notice: null, pendingAction: action.pendingAction }
    case 'actionSucceeded': {
      if (state.pendingAction?.requestId !== action.requestId) return state
      if (!action.clearRejectReasonFor) {
        return { ...state, error: null, notice: action.notice }
      }
      const rejectReasons = { ...state.rejectReasons }
      delete rejectReasons[action.clearRejectReasonFor]
      return { ...state, error: null, notice: action.notice, rejectReasons }
    }
    case 'actionFailed':
      if (state.pendingAction?.requestId !== action.requestId) return state
      return { ...state, error: action.error }
    case 'actionFinished':
      if (state.pendingAction?.requestId !== action.requestId) return state
      return { ...state, pendingAction: null }
    case 'rejectReasonChanged':
      return {
        ...state,
        rejectReasons: { ...state.rejectReasons, [action.candidateId]: action.text },
      }
    case 'validationFailed':
      return { ...state, error: action.error }
  }
}

const MANUAL_REVIEW_SLA_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

export default function AdminDashboard() {
  const { replace } = useRouter()
  const { signOut } = useAuth()
  const language = useAppLanguage()
  const copy = adminDashboardCopy[language]
  const [state, dispatch] = useReducer(adminDashboardReducer, initialAdminDashboardState)
  const loadRequestIdRef = useRef(0)
  const actionRequestIdRef = useRef(0)
  const { candidates, error, hasLoadedCandidates, loading, notice, pendingAction, rejectReasons } = state
  const manualCount = candidates.length
  const pendingCountLabel = hasLoadedCandidates
    ? copy.pendingCount(manualCount)
    : loading
      ? copy.pendingCountLoading
      : copy.pendingCountUnavailable

  const loadCandidates = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current
    dispatch({ type: 'loadStarted', requestId })
    try {
      const result = await adminLearningService.listCandidates('manual_review')
      if (result.success) {
        dispatch({ type: 'loadSucceeded', candidates: result.data.candidates, requestId })
      } else {
        dispatch({ type: 'loadFailed', error: 'loadFailed', requestId })
      }
    } catch {
      dispatch({ type: 'loadFailed', error: 'loadFailed', requestId })
    }
  }, [])

  useEffect(() => {
    let active = true
    void adminLearningService.listCandidates('manual_review')
      .then((result) => {
        if (!active) return
        if (result.success) {
          dispatch({ type: 'loadSucceeded', candidates: result.data.candidates, requestId: 0 })
        } else {
          dispatch({ type: 'loadFailed', error: 'loadFailed', requestId: 0 })
        }
      })
      .catch(() => {
        if (active) dispatch({ type: 'loadFailed', error: 'loadFailed', requestId: 0 })
      })
    return () => {
      active = false
    }
  }, [])

  async function approveCandidate(candidateId: string) {
    const requestId = ++actionRequestIdRef.current
    dispatch({
      type: 'actionStarted',
      pendingAction: { candidateId, action: 'approve', requestId },
    })
    try {
      const result = await adminLearningService.approveCandidate(candidateId)
      if (result.success) {
        dispatch({ type: 'actionSucceeded', notice: 'approved', requestId })
        await loadCandidates()
      } else {
        dispatch({ type: 'actionFailed', error: 'approveFailed', requestId })
      }
    } catch {
      dispatch({ type: 'actionFailed', error: 'approveFailed', requestId })
    } finally {
      dispatch({ type: 'actionFinished', requestId })
    }
  }

  async function rejectCandidate(candidateId: string) {
    const reason = rejectReasons[candidateId]?.trim()
    if (!reason) {
      dispatch({ type: 'validationFailed', error: 'rejectReasonRequired' })
      return
    }
    const requestId = ++actionRequestIdRef.current
    dispatch({
      type: 'actionStarted',
      pendingAction: { candidateId, action: 'reject', requestId },
    })
    try {
      const result = await adminLearningService.rejectCandidate(candidateId, { reason })
      if (result.success) {
        dispatch({
          type: 'actionSucceeded',
          clearRejectReasonFor: candidateId,
          notice: 'rejected',
          requestId,
        })
        await loadCandidates()
      } else {
        dispatch({ type: 'actionFailed', error: 'rejectFailed', requestId })
      }
    } catch {
      dispatch({ type: 'actionFailed', error: 'rejectFailed', requestId })
    } finally {
      dispatch({ type: 'actionFinished', requestId })
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} testID="admin-dashboard">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>
        <View style={styles.headerMeta}>
          <Text style={styles.metaText}>{pendingCountLabel}</Text>
          <Pressable
            accessibilityLabel={copy.actions.refresh}
            accessibilityRole="button"
            onPress={() => void loadCandidates()}
            style={styles.refreshButton}
            testID="admin-learning-refresh"
          >
            <Text style={styles.refreshText}>{copy.actions.refresh}</Text>
          </Pressable>
        </View>
      </View>

      {notice ? <Text style={styles.notice} testID="admin-learning-notice">{copy.notices[notice]}</Text> : null}
      {error ? <Text style={styles.error} testID="admin-learning-error">{copy.errors[error]}</Text> : null}

      {loading ? (
        <View style={styles.stateBox} testID="admin-learning-loading">
          <ActivityIndicator />
          <Text style={styles.stateText}>{copy.loading}</Text>
        </View>
      ) : candidates.length === 0 ? (
        <View style={styles.stateBox} testID="admin-learning-empty">
          <Text style={styles.stateTitle}>{copy.empty.title}</Text>
          <Text style={styles.stateText}>{copy.empty.body}</Text>
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
                    <Text style={styles.candidateTitle}>{candidateTypeLabel(candidate.candidate_type, copy)}</Text>
                    <Text style={styles.candidateMeta}>{candidateSkill(candidate)} · {serviceLabel(candidate.affected_service, copy)}</Text>
                  </View>
                  <View style={styles.statusStack}>
                    <Text style={styles.statusPill}>{copy.statusPending}</Text>
                    {slaOverdue ? <Text style={styles.slaWarning}>{copy.slaOverdue(MANUAL_REVIEW_SLA_DAYS)}</Text> : null}
                  </View>
                </View>

                <View style={styles.metrics}>
                  <Metric label={copy.metrics.evidence} value={`${candidate.evidence_count}`} />
                  <Metric label={copy.metrics.confidence} value={formatPercent(candidate.confidence)} />
                  <Metric label={copy.metrics.area} value={candidate.affected_district ?? copy.scopeAny} />
                </View>

                <Text style={styles.detailText}>{copy.detail.problem}: {candidate.affected_problem ?? copy.scopeAny}</Text>
                <Text style={styles.detailText}>{copy.detail.source}: {evidenceSource(candidate, copy)}</Text>

                <KaelTextField
                  accessibilityLabel={copy.reasonPlaceholder}
                  inputShellStyle={styles.reasonInputShell}
                  onChangeText={(text) => dispatch({
                    type: 'rejectReasonChanged',
                    candidateId: candidate.id,
                    text,
                  })}
                  placeholder={copy.reasonPlaceholder}
                  placeholderTextColor="#7A8B85"
                  style={styles.reasonInputText}
                  testID={`admin-learning-reason-${candidate.id}`}
                  value={reason}
                />

                <View style={styles.actions}>
                  <Pressable
                    accessibilityLabel={approving ? copy.actions.approving : copy.actions.approve}
                    accessibilityRole="button"
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => void approveCandidate(candidate.id)}
                    style={[styles.actionButton, disabled ? styles.disabledButton : null]}
                    testID={`admin-learning-approve-${candidate.id}`}
                  >
                    <Text style={styles.actionText}>{approving ? copy.actions.approving : copy.actions.approve}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={rejecting ? copy.actions.rejecting : copy.actions.reject}
                    accessibilityRole="button"
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => void rejectCandidate(candidate.id)}
                    style={[styles.actionButton, styles.rejectButton, disabled ? styles.disabledButton : null]}
                    testID={`admin-learning-reject-${candidate.id}`}
                  >
                    <Text style={styles.rejectText}>{rejecting ? copy.actions.rejecting : copy.actions.reject}</Text>
                  </Pressable>
                </View>
              </View>
            )
          })}
        </View>
      )}

      <View style={styles.accountActions}>
        <Pressable
          accessibilityLabel={copy.actions.switchAccount}
          accessibilityRole="button"
          onPress={() => replace('/(auth)/login')}
          style={styles.accountButton}
          testID="admin-shell-switch-account"
        >
          <Text style={styles.accountButtonText}>{copy.actions.switchAccount}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={copy.actions.signOut}
          accessibilityRole="button"
          onPress={() => void signOut?.()}
          style={[styles.accountButton, styles.secondaryButton]}
          testID="admin-shell-sign-out"
        >
          <Text style={styles.accountButtonText}>{copy.actions.signOut}</Text>
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

function candidateTypeLabel(type: string, copy: AdminDashboardCopy) {
  return ({
    price_prior_update: copy.candidateTypes.pricePriorUpdate,
    analysis_rule: copy.candidateTypes.analysisRule,
    service_knowledge_candidate: copy.candidateTypes.serviceKnowledge,
    safety_pattern_candidate: copy.candidateTypes.safetyPattern,
    decline_reason_candidate: copy.candidateTypes.declineReason,
  } as Record<string, string>)[type] ?? copy.candidateTypes.fallback
}

function serviceLabel(
  service: KaelLearningCandidateSummary['affected_service'],
  copy: AdminDashboardCopy,
) {
  return service ? copy.services[service] : copy.services.systemWide
}

function candidateSkill(candidate: KaelLearningCandidateSummary) {
  const skill = candidate.suggested_payload.skill_id
  return typeof skill === 'string' ? skill : 'Kael'
}

function evidenceSource(candidate: KaelLearningCandidateSummary, copy: AdminDashboardCopy) {
  const source = candidate.evidence_snapshot?.source ?? candidate.suggested_payload.evidence_source
  if (source === 'completed_reviewed_jobs') return copy.evidenceSources.completedReviewedJobs
  if (source === 'candidate_payload') return copy.evidenceSources.candidatePayload
  if (source === 'learning_rule_monitor') return copy.evidenceSources.learningRuleMonitor
  return copy.evidenceSources.fallback
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
