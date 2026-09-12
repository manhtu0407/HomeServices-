import { useCallback, useEffect, useReducer, useRef } from 'react'
import { Image } from 'expo-image'
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native'
import { z } from 'zod'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type {
  AdminWorkerFinanceSnapshotResponse,
  AdminViewTransactionSummary,
  AdminViewWorkerApplicationSummary,
  AdminViewWorkerReviewDetail,
  AdminViewWorkerProfileDecisionInput,
} from '@/lib/api-types/admin'
import { shouldRetainClientRequestId } from '@/lib/client-request-id'
import { useAuth } from '@/lib/auth-provider'
import { createClientDiagnosticMetadata, type ApiResult } from '@/lib/api'
import { adminControlService } from '@/lib/services'
import type { AdminSectionsCopy } from './admin-sections-copy'
import { MetaItem, StatusPill } from './admin-section-cards'
import { createFinanceFormatters } from './admin-finance-formatters'
import { styles } from './admin-sections-styles'
import { workerReviewCopy } from './admin-worker-review-copy'
import { AdminText } from './admin-text'

type WorkerReviewModalProps = {
  actionPending: string | null
  canManage: boolean
  canReadFinance: boolean
  canReview: boolean
  copy: AdminSectionsCopy
  formatDate: (value: string | null | undefined) => string
  language: 'vi' | 'en'
  onAccessApprove: () => void
  onAccessReject: () => void
  onAccessRequestChanges: () => void
  onClose: () => void
  onRefresh: () => Promise<void>
  onReinstate: () => void
  onSuspend: () => void
  reduceMotion: boolean
  serviceLabel: (value: AdminViewTransactionSummary['service_type']) => string
  worker: AdminViewWorkerApplicationSummary | null
}

type WorkerReviewState = {
  detail: AdminViewWorkerReviewDetail | null
  error: string | null
  finance: AdminWorkerFinanceSnapshotResponse | null
  financeError: string | null
  financeLoading: boolean
  loading: boolean
  profilePending: boolean
  reason: string
  requestingChanges: boolean
  unresolved: AdminViewWorkerProfileDecisionInput | null
  decisionSaved: boolean
  supportCode: string | null
}

function reviewSupportCode(result?: ApiResult<unknown>) {
  return result?.meta?.supportCode ?? result?.meta?.clientDiagnosticCode
    ?? createClientDiagnosticMetadata().clientDiagnosticCode
}

const reviewReceiptSchema = z.object({
  ok: z.literal(true), application_id: z.string(), worker_id: z.string(),
  decision: z.enum(['approve', 'request_changes']),
  verification_status: z.enum(['approved', 'rejected']),
  decided_at: z.iso.datetime({ offset: true }),
})

export function AdminWorkerReviewModal(props: WorkerReviewModalProps) {
  const { session, role } = useAuth()
  if (!props.worker || !session?.user.id || !session.access_token?.trim()
    || (role !== 'admin' && role !== 'admin_operator')
    || session.user.app_metadata?.provider === 'local-visual-audit') return null
  return <WorkerReviewSession {...props} worker={props.worker} accessToken={session.access_token}
    key={`${session.user.id}:${props.worker.id}:${props.worker.worker_id}`} />
}

function WorkerReviewSession(props: WorkerReviewModalProps & { worker: AdminViewWorkerApplicationSummary; accessToken: string }) {
  const { worker } = props
  const { accessToken } = props
  const { id: applicationId, worker_id: workerId } = worker
  const profileRequest = useRef<object | null>(null)
  const detailRequest = useRef<object | null>(null)
  const financeRequest = useRef<object | null>(null)
  const [state, patch] = useReducer(
    (current: WorkerReviewState, next: Partial<WorkerReviewState>) => ({ ...current, ...next }),
    {
      detail: null,
      error: null,
      finance: null,
      financeError: null,
      financeLoading: false,
      loading: Boolean(worker),
      profilePending: false,
      reason: '',
      requestingChanges: false,
      unresolved: null,
      decisionSaved: false,
      supportCode: null,
    },
  )
  const { detail, error, finance, financeError, financeLoading, loading, profilePending, reason, requestingChanges, unresolved, decisionSaved, supportCode } = state
  const reviewCopy = workerReviewCopy[props.language]
  const snapshotReady = Boolean(detail && detail.application.id === worker?.id
    && detail.application.worker_id === worker?.worker_id
    && detail.application.profile_review_queue_id && detail.profile?.updated_at)

  const loadDetail = useCallback(async () => {
    const request = {}
    detailRequest.current = request
    patch({ detail: null, error: null, supportCode: null, loading: true })
    try {
      const result = await adminControlService.getWorkerReviewDetail(applicationId, accessToken)
      if (detailRequest.current !== request) return
      patch(result.success && result.data.application.id === applicationId && result.data.application.worker_id === workerId
        ? { detail: result.data, error: null, loading: false }
        : { error: reviewCopy.error, supportCode: reviewSupportCode(result), loading: false })
    } catch {
      if (detailRequest.current === request) patch({ error: reviewCopy.error, supportCode: reviewSupportCode(), loading: false })
    }
  }, [applicationId, workerId, reviewCopy.error, accessToken])

  const loadFinance = useCallback(async () => {
    if (!props.canReadFinance) return
    const request = {}
    financeRequest.current = request
    patch({ financeLoading: true, financeError: null })
    try {
      const result = await adminControlService.getWorkerFinanceSnapshot(workerId, {}, accessToken)
      if (financeRequest.current !== request) return
      patch(result.success && result.data.worker_id === workerId
        ? { finance: result.data, financeError: null, financeLoading: false }
        : { finance: null, financeError: `${reviewCopy.financeError} (${reviewSupportCode(result)})`, financeLoading: false })
    } catch {
      if (financeRequest.current === request) patch({ finance: null, financeError: `${reviewCopy.financeError} (${reviewSupportCode()})`, financeLoading: false })
    }
  }, [props.canReadFinance, workerId, reviewCopy.financeError, accessToken])

  useEffect(() => {
    void loadDetail()
    return () => { detailRequest.current = null }
  }, [loadDetail])

  useEffect(() => {
    patch({ finance: null, financeError: null, financeLoading: props.canReadFinance })
    if (props.canReadFinance) void loadFinance()
    return () => { financeRequest.current = null }
  }, [loadFinance, props.canReadFinance])

  useEffect(() => () => { profileRequest.current = null }, [])

  const retryDetail = () => {
    if (profileRequest.current || unresolved || decisionSaved) return
    void loadDetail()
  }

  const refreshAfterDecision = async (request: object) => {
    try {
      await props.onRefresh()
      if (profileRequest.current === request) props.onClose()
    } catch {
      if (profileRequest.current === request) patch({ error: reviewCopy.savedRefreshError, supportCode: reviewSupportCode() })
    }
  }

  const retryList = async () => {
    if (profileRequest.current || !decisionSaved) return
    const request = {}
    profileRequest.current = request
    patch({ profilePending: true, error: null, supportCode: null })
    await refreshAfterDecision(request)
    if (profileRequest.current === request) {
      profileRequest.current = null
      patch({ profilePending: false })
    }
  }

  const decideProfile = async (decision: 'approve' | 'request_changes') => {
    if (profileRequest.current || !props.canReview || decisionSaved) return
    if (!unresolved && decision === 'request_changes' && reason.trim().length < 3) {
      patch({ error: reviewCopy.reasonPlaceholder, supportCode: reviewSupportCode() })
      return
    }
    const queueId = unresolved?.profile_review_queue_id ?? detail?.application.profile_review_queue_id
    const revision = unresolved?.expected_profile_updated_at ?? detail?.profile?.updated_at
    if ((!unresolved && !snapshotReady) || !queueId || !revision) {
      patch({ error: reviewCopy.staleReview, supportCode: reviewSupportCode() })
      return
    }
    const request = {}
    profileRequest.current = request
    const command = unresolved ?? {
      decision, profile_review_queue_id: queueId, expected_profile_updated_at: revision,
      ...(decision === 'request_changes' ? { reason: reason.trim() } : {}),
    }
    patch({ error: null, supportCode: null, profilePending: true, unresolved: command })
    try {
      const result = await adminControlService.decideWorkerProfile(worker.id, command, accessToken)
      // Selection can change while the mutation commits; never apply its receipt to another modal.
      if (profileRequest.current !== request) return
      if (!result.success) {
        const ambiguous = Boolean(unresolved) || shouldRetainClientRequestId(result)
        const message = ambiguous ? reviewCopy.unknownOutcome
          : result.code === 'STALE_REVIEW' || result.code === 'IDEMPOTENCY_CONFLICT' || result.code === 'ALREADY_REVIEWED'
            ? reviewCopy.staleReview : reviewCopy.decisionError
        patch({ error: message, supportCode: reviewSupportCode(result),
          ...(!ambiguous ? { unresolved: null, detail: null } : {}),
        })
        return
      }
      const receipt = reviewReceiptSchema.safeParse(result.data)
      if (!receipt.success || receipt.data.application_id !== worker.id
        || receipt.data.worker_id !== worker.worker_id || receipt.data.decision !== command.decision
        || receipt.data.verification_status !== (command.decision === 'approve' ? 'approved' : 'rejected')) {
        patch({ error: reviewCopy.unknownOutcome, supportCode: reviewSupportCode(result) })
        return
      }
      patch({ decisionSaved: true, unresolved: null })
      await refreshAfterDecision(request)
    } catch {
      if (profileRequest.current === request) patch({ error: reviewCopy.unknownOutcome, supportCode: reviewSupportCode() })
    } finally {
      if (profileRequest.current === request) {
        profileRequest.current = null
        patch({ profilePending: false })
      }
    }
  }

  if (!worker) return null
  return <Modal animationType={props.reduceMotion ? 'none' : 'fade'} transparent visible onRequestClose={props.onClose}>
    <View style={styles.modalBackdrop}><View style={styles.modalCard} testID="admin-worker-review-detail">
      <ModalHeader copy={props.copy} onClose={props.onClose} worker={worker} reviewCopy={reviewCopy} />
      {loading ? <View style={styles.detailLoading}><ActivityIndicator color={color.brand.primary} /></View> : error && !detail ? <View accessibilityRole="alert" style={styles.error}><AdminText textRole="subheadline" style={styles.errorText}>{reviewCopy.error}</AdminText><KaelButton label={reviewCopy.actions.retry} onPress={retryDetail} variant="secondary" /></View> : detail ? <>
        <ScrollView style={styles.modalBodyScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
          <LoginSection detail={detail} copy={props.copy} formatDate={props.formatDate} reviewCopy={reviewCopy} />
          <ChecklistSection worker={detail.application} reviewCopy={reviewCopy} />
          <FinanceSection finance={props.canReadFinance ? finance : null} error={props.canReadFinance ? financeError : null} formatDate={props.formatDate} language={props.language} loading={props.canReadFinance && financeLoading} reviewCopy={reviewCopy} />
          <ProfileSections detail={detail} copy={props.copy} reviewCopy={reviewCopy} serviceLabel={props.serviceLabel} />
          <HistorySection detail={detail} formatDate={props.formatDate} reviewCopy={reviewCopy} />
        </ScrollView>
        {error ? <AdminText textRole="subheadline" accessibilityRole="alert" style={styles.errorText}>{error}</AdminText> : null}
        {decisionSaved ? <>
          {!error ? <AdminText textRole="subheadline" accessibilityRole="alert">{reviewCopy.success}</AdminText> : null}
          <KaelButton label={reviewCopy.actions.reloadList} onPress={() => { void retryList() }} disabled={profilePending} variant="secondary" />
        </> : <>
          {(!snapshotReady || error) && !unresolved ? <KaelButton label={reviewCopy.actions.reload} onPress={retryDetail} disabled={profilePending} variant="secondary" /> : null}
          <WorkerReviewActions {...props} worker={detail.application} snapshotReady={snapshotReady} unresolved={Boolean(unresolved)} profilePending={profilePending} reason={reason} requestingChanges={requestingChanges} setReason={(value) => { if (!profileRequest.current && !unresolved) patch({ reason: value }) }} setRequestingChanges={(value) => { if (!profileRequest.current && !unresolved) patch({ requestingChanges: value }) }} decideProfile={decideProfile} reviewCopy={reviewCopy} />
        </>}
      </> : null}
      {error && supportCode ? <AdminText textRole="footnote" accessibilityLabel={`${reviewCopy.supportCode}: ${supportCode}`}>{reviewCopy.supportCode}: {supportCode}</AdminText> : null}
    </View></View>
  </Modal>
}

function ModalHeader({ copy, onClose, reviewCopy, worker }: { copy: AdminSectionsCopy; onClose: () => void; reviewCopy: typeof workerReviewCopy.vi; worker: AdminViewWorkerApplicationSummary }) {
  return <View style={styles.modalHeader}>
    <View style={styles.cardTitleBlock}><AdminText textRole="title2" style={styles.modalTitle}>{worker.full_name ?? copy.notRecorded}</AdminText><StatusPill label={reviewCopy.stage[worker.stage]} tone={worker.stage === 'verified' ? 'success' : worker.stage === 'ready_verification' ? 'warning' : 'neutral'} /></View>
    <Pressable accessibilityRole="button" accessibilityLabel={reviewCopy.actions.close} onPress={onClose}><AdminText textRole="subheadline" style={styles.closeLabel}>×</AdminText></Pressable>
  </View>
}

function LoginSection({ copy, detail, formatDate, reviewCopy }: { copy: AdminSectionsCopy; detail: AdminViewWorkerReviewDetail; formatDate: WorkerReviewModalProps['formatDate']; reviewCopy: typeof workerReviewCopy.vi }) {
  return <View style={styles.reviewSection}>
    <AdminText textRole="title2" style={styles.reviewSectionTitle}>{reviewCopy.group.login}</AdminText>
    <View style={styles.metaGrid}>
      <MetaItem label={copy.labels.fullName} value={detail.login_gates.full_name ?? copy.notRecorded} />
      <MetaItem label={reviewCopy.labels.contact} value={detail.login_gates.email ?? detail.login_gates.phone ?? copy.notRecorded} />
      <MetaItem label={reviewCopy.group.access} value={reviewCopy.stage[detail.application.stage]} />
      <MetaItem label={reviewCopy.labels.updated} value={formatDate(detail.application.updated_at)} />
    </View>
  </View>
}

function ChecklistSection({ reviewCopy, worker }: { reviewCopy: typeof workerReviewCopy.vi; worker: AdminViewWorkerApplicationSummary }) {
  return <View style={styles.reviewSection}>
    <AdminText textRole="title2" style={styles.reviewSectionTitle}>{reviewCopy.group.checklist}</AdminText>
    <View style={styles.reviewSummary}><AdminText textRole="headline" style={styles.cardTitle}>{reviewCopy.progress(worker.checklist.completed_count, worker.checklist.total_count)}</AdminText>{worker.checklist.missing.length > 0 ? <AdminText textRole="subheadline" style={styles.reviewSummaryText}>{reviewCopy.missingLabel}: {worker.checklist.missing.map((field) => reviewCopy.field[field] ?? field).join(' · ')}</AdminText> : null}</View>
  </View>
}

function FinanceSection({
  error,
  finance,
  formatDate,
  language,
  loading,
  reviewCopy,
}: {
  error: string | null
  finance: AdminWorkerFinanceSnapshotResponse | null
  formatDate: WorkerReviewModalProps['formatDate']
  language: 'vi' | 'en'
  loading: boolean
  reviewCopy: typeof workerReviewCopy.vi
}) {
  const formatters = createFinanceFormatters(language, '—')
  return <View style={styles.reviewSection} testID="admin-worker-finance-snapshot">
    <AdminText textRole="title2" style={styles.reviewSectionTitle}>{reviewCopy.group.finance}</AdminText>
    {loading ? <AdminText textRole="subheadline" style={styles.reviewSummaryText}>{language === 'vi' ? 'Đang tải thông tin tài chính...' : 'Loading finance data...'}</AdminText> : error && !finance ? <AdminText textRole="subheadline" accessibilityRole="alert" style={styles.reviewSummaryText}>{error}</AdminText> : finance ? <>
      <View style={styles.metaGrid}>
        <MetaItem label={language === 'vi' ? 'Có thể rút' : 'Available'} value={formatters.formatCurrency(finance.available_balance)} />
        <MetaItem label={language === 'vi' ? 'Tạm ghi nhận' : 'Provisional'} value={formatters.formatCurrency(finance.provisional_payment_amount)} />
        <MetaItem label={language === 'vi' ? 'Đang giữ' : 'On hold'} value={formatters.formatCurrency(finance.on_hold_amount)} />
        <MetaItem label={language === 'vi' ? 'Đã giữ cho yêu cầu rút tiền' : 'Withdrawal reserved'} value={formatters.formatCurrency(finance.withdrawal_reserved_amount)} />
        <MetaItem label={language === 'vi' ? 'Hoa hồng tiền mặt đã thu' : 'Cash commission collected'} value={formatters.formatCurrency(finance.cash_commission_collected_total)} />
        <MetaItem label={language === 'vi' ? 'Hoa hồng tiền mặt còn thiếu' : 'Cash commission due'} value={formatters.formatCurrency(finance.cash_commission_due_total)} />
        <MetaItem label={language === 'vi' ? 'Đã rút' : 'Withdrawn'} value={formatters.formatCurrency(finance.withdrawn_total)} />
        <MetaItem label={language === 'vi' ? 'Chờ quản trị viên xác minh' : 'Pending Admin review'} value={`${finance.provisional_payment_count} · ${formatters.formatCurrency(finance.provisional_payment_amount)}`} />
      </View>
      <AdminText textRole="subheadline" style={styles.reviewSummaryText}>{finance.withdrawal_eligible_at
        ? `${language === 'vi' ? 'Mốc rút sớm nhất' : 'Earliest withdrawal eligibility'}: ${formatDate(finance.withdrawal_eligible_at)}`
        : (language === 'vi' ? 'Không có khoản rút tiền nào đang chờ đủ thời gian.' : 'No withdrawal is waiting for eligibility.')}</AdminText>
    </> : <AdminText textRole="subheadline" style={styles.reviewSummaryText}>{reviewCopy.noFinance}</AdminText>}
  </View>
}

function ProfileSections({ copy, detail, reviewCopy, serviceLabel }: { copy: AdminSectionsCopy; detail: AdminViewWorkerReviewDetail; reviewCopy: typeof workerReviewCopy.vi; serviceLabel: WorkerReviewModalProps['serviceLabel'] }) {
  const profile = detail.profile
  if (!profile) return <View style={styles.reviewSection}><AdminText textRole="title2" style={styles.reviewSectionTitle}>{reviewCopy.group.skills}</AdminText><AdminText textRole="subheadline" style={styles.reviewSummaryText}>{reviewCopy.noProfile}</AdminText></View>
  return <>
    <View style={styles.reviewSection}><AdminText textRole="title2" style={styles.reviewSectionTitle}>{reviewCopy.group.skills}</AdminText><View style={styles.metaGrid}>
      <MetaItem label={reviewCopy.labels.legalName} value={profile.legal_name ?? copy.notRecorded} />
      <MetaItem label={reviewCopy.labels.birthDate} value={profile.date_of_birth ?? copy.notRecorded} />
      <MetaItem label={reviewCopy.labels.services} value={profile.service_types.length ? profile.service_types.map(serviceLabel).join(' · ') : copy.notRecorded} />
      <MetaItem label={reviewCopy.labels.experience} value={reviewCopy.experience(profile.years_experience)} />
      <MetaItem label={reviewCopy.labels.districts} value={profile.districts.join(' · ') || copy.notRecorded} />
      <MetaItem label={reviewCopy.labels.radius} value={profile.service_radius_km === null ? copy.notRecorded : `${profile.service_radius_km} km`} />
    </View></View>
    <DocumentSection detail={detail} reviewCopy={reviewCopy} />
    <View style={styles.reviewSection}><AdminText textRole="title2" style={styles.reviewSectionTitle}>{reviewCopy.group.bank}</AdminText><View style={styles.metaGrid}><MetaItem label={reviewCopy.labels.bank} value={profile.bank_name ?? copy.notRecorded} /><MetaItem label={reviewCopy.labels.account} value={profile.bank_account ?? copy.notRecorded} /></View></View>
  </>
}

function DocumentSection({ detail, reviewCopy }: { detail: AdminViewWorkerReviewDetail; reviewCopy: typeof workerReviewCopy.vi }) {
  const documents = detail.profile?.documents
  const items = [
    { key: 'cccd_front', label: reviewCopy.field.cccd_front, uri: documents?.cccd_front_url },
    { key: 'cccd_back', label: reviewCopy.field.cccd_back, uri: documents?.cccd_back_url },
    { key: 'selfie', label: reviewCopy.field.selfie, uri: documents?.selfie_url },
  ].filter((item): item is { key: string; label: string; uri: string } => Boolean(item.uri))
  return <View style={styles.reviewSection}><AdminText textRole="title2" style={styles.reviewSectionTitle}>{reviewCopy.group.documents}</AdminText>{items.length ? <View style={styles.documentGrid}>{items.map((item) => <View key={item.key} style={styles.documentCard}><Image accessibilityLabel={item.label} contentFit="cover" source={{ uri: item.uri }} style={styles.documentImage} /><AdminText textRole="subheadline" style={styles.documentLabel}>{item.label}</AdminText></View>)}</View> : <AdminText textRole="subheadline" style={styles.reviewSummaryText}>{reviewCopy.noProfile}</AdminText>}</View>
}

function HistorySection({ detail, formatDate, reviewCopy }: { detail: AdminViewWorkerReviewDetail; formatDate: WorkerReviewModalProps['formatDate']; reviewCopy: typeof workerReviewCopy.vi }) {
  return <View style={styles.reviewSection}><AdminText textRole="title2" style={styles.reviewSectionTitle}>{reviewCopy.group.history}</AdminText>{detail.history.length ? detail.history.map((item, index) => <View key={`${item.decided_at}-${index}`} style={styles.historyRow}><AdminText textRole="subheadline" style={styles.historyDecision}>{item.stage === 'access' ? reviewCopy.group.access : reviewCopy.group.checklist} · {reviewCopy.decision[item.decision]}</AdminText>{item.reason ? <AdminText textRole="subheadline" style={styles.historyReason}>{item.reason}</AdminText> : null}<AdminText textRole="subheadline" style={styles.historyReason}>{item.decided_by_name ?? reviewCopy.unknownReviewer} · {formatDate(item.decided_at)}</AdminText></View>) : <AdminText textRole="subheadline" style={styles.reviewSummaryText}>{reviewCopy.noHistory}</AdminText>}</View>
}

type WorkerReviewActionsProps = WorkerReviewModalProps & {
  snapshotReady: boolean
  unresolved: boolean
  decideProfile: (decision: 'approve' | 'request_changes') => Promise<void>
  profilePending: boolean
  reason: string
  requestingChanges: boolean
  reviewCopy: typeof workerReviewCopy.vi
  setReason: (value: string) => void
  setRequestingChanges: (value: boolean) => void
}

function WorkerReviewActions(props: WorkerReviewActionsProps) {
  const { worker } = props
  if (!worker) return null
  const pending = Boolean(props.actionPending) || props.profilePending
  const profileDisabled = pending || !props.snapshotReady
  if (props.requestingChanges) return <View style={styles.modalActionStack}><KaelTextField accessibilityLabel={props.reviewCopy.reasonPlaceholder} editable={!pending && !props.unresolved} multiline value={props.reason} onChangeText={props.setReason} placeholder={props.reviewCopy.reasonPlaceholder} placeholderTextColor={color.text.muted} inputShellStyle={styles.reasonInput} style={styles.reasonText} /><View style={styles.inlineActions}><KaelButton label={props.reviewCopy.actions.close} onPress={() => props.setRequestingChanges(false)} disabled={pending || props.unresolved} style={styles.inlineAction} variant="secondary" /><KaelButton label={pending ? props.reviewCopy.actions.saving : props.unresolved ? props.reviewCopy.actions.reconcile : props.reviewCopy.actions.requestChanges} onPress={() => { void props.decideProfile('request_changes') }} disabled={profileDisabled || !props.canReview} style={styles.inlineAction} variant="primary" /></View></View>
  if (props.unresolved) return <KaelButton label={pending ? props.reviewCopy.actions.saving : props.reviewCopy.actions.reconcile} onPress={() => { void props.decideProfile('approve') }} disabled={pending || !props.canReview} variant="primary" />
  if (worker.stage === 'pending_access' && props.canReview) return <View style={styles.inlineActions}><KaelButton label={props.reviewCopy.actions.approveAccess} onPress={props.onAccessApprove} disabled={pending} style={styles.inlineAction} variant="primary" /><KaelButton label={props.reviewCopy.actions.requestChanges} onPress={props.onAccessRequestChanges} disabled={pending} style={styles.inlineAction} variant="secondary" /><KaelButton label={props.copy.actions.reject} onPress={props.onAccessReject} disabled={pending} style={styles.inlineAction} variant="destructive" /></View>
  if (worker.stage === 'ready_verification' && props.canReview) return <View style={styles.inlineActions}><KaelButton label={pending ? props.reviewCopy.actions.saving : props.reviewCopy.actions.approveProfile} onPress={() => { void props.decideProfile('approve') }} disabled={profileDisabled} style={styles.inlineAction} variant="primary" /><KaelButton label={props.reviewCopy.actions.requestChanges} onPress={() => props.setRequestingChanges(true)} disabled={profileDisabled} style={styles.inlineAction} variant="secondary" /></View>
  if (props.canManage && worker.worker_profile) return <KaelButton label={worker.worker_profile.is_suspended ? (props.language === 'vi' ? 'Khôi phục hoạt động' : 'Reinstate access') : (props.language === 'vi' ? 'Tạm dừng hoạt động' : 'Suspend access')} onPress={worker.worker_profile.is_suspended ? props.onReinstate : props.onSuspend} disabled={pending} variant={worker.worker_profile.is_suspended ? 'secondary' : 'destructive'} />
  return null
}
