import { useCallback, useEffect, useReducer } from 'react'
import { Image } from 'expo-image'
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type {
  AdminWorkerFinanceSnapshotResponse,
  AdminViewTransactionSummary,
  AdminViewWorkerApplicationSummary,
  AdminViewWorkerReviewDetail,
} from '@/lib/api-types/admin'
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
}

export function AdminWorkerReviewModal(props: WorkerReviewModalProps) {
  const { worker } = props
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
    },
  )
  const { detail, error, finance, financeError, financeLoading, loading, profilePending, reason, requestingChanges } = state
  const reviewCopy = workerReviewCopy[props.language]

  const loadDetail = useCallback(async () => {
    if (!worker) return
    const result = await adminControlService.getWorkerReviewDetail(worker.id)
    patch(result.success
      ? { detail: result.data, error: null, loading: false }
      : { error: result.error, loading: false })
  }, [worker])

  const loadFinance = useCallback(async () => {
    if (!worker || !props.canReadFinance) return
    patch({ financeLoading: true, financeError: null })
    const result = await adminControlService.getWorkerFinanceSnapshot(worker.worker_id)
    patch(result.success
      ? { finance: result.data, financeError: null, financeLoading: false }
      : { financeError: result.error, financeLoading: false })
  }, [props.canReadFinance, worker])

  useEffect(() => {
    if (!worker) return
    let cancelled = false
    patch({ detail: null, error: null, finance: null, financeError: null, financeLoading: props.canReadFinance, loading: true, reason: '', requestingChanges: false })
    void adminControlService.getWorkerReviewDetail(worker.id).then((result) => {
      if (cancelled) return
      patch(result.success
        ? { detail: result.data, error: null, loading: false }
        : { error: result.error, loading: false })
    })
    if (props.canReadFinance) void loadFinance()
    return () => { cancelled = true }
  }, [loadFinance, props.canReadFinance, worker])

  const retryDetail = () => {
    patch({ error: null, loading: true })
    void loadDetail()
  }

  const decideProfile = async (decision: 'approve' | 'request_changes') => {
    if (!worker || (decision === 'request_changes' && reason.trim().length < 3)) {
      patch({ error: reviewCopy.reasonPlaceholder })
      return
    }
    patch({ error: null, profilePending: true })
    const result = await adminControlService.decideWorkerProfile(worker.id, {
      decision,
      ...(decision === 'request_changes' ? { reason: reason.trim() } : {}),
    })
    if (!result.success) {
      patch({ error: result.error, profilePending: false })
      return
    }
    patch({ profilePending: false })
    await props.onRefresh()
    props.onClose()
  }

  if (!worker) return null
  return <Modal animationType={props.reduceMotion ? 'none' : 'fade'} transparent visible onRequestClose={props.onClose}>
    <View style={styles.modalBackdrop}><View style={styles.modalCard} testID="admin-worker-review-detail">
      <ModalHeader copy={props.copy} onClose={props.onClose} worker={worker} reviewCopy={reviewCopy} />
      {loading ? <View style={styles.detailLoading}><ActivityIndicator color={color.brand.primary} /></View> : error && !detail ? <View accessibilityRole="alert" style={styles.error}><AdminText textRole="subheadline" style={styles.errorText}>{reviewCopy.error}</AdminText><KaelButton label={reviewCopy.actions.retry} onPress={retryDetail} variant="secondary" /></View> : detail ? <>
        <ScrollView style={styles.modalBodyScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
          <LoginSection detail={detail} copy={props.copy} formatDate={props.formatDate} reviewCopy={reviewCopy} />
          <ChecklistSection worker={detail.application} reviewCopy={reviewCopy} />
          <FinanceSection finance={finance} error={financeError} formatDate={props.formatDate} language={props.language} loading={financeLoading} reviewCopy={reviewCopy} />
          <ProfileSections detail={detail} copy={props.copy} reviewCopy={reviewCopy} serviceLabel={props.serviceLabel} />
          <HistorySection detail={detail} formatDate={props.formatDate} reviewCopy={reviewCopy} />
        </ScrollView>
        {error ? <AdminText textRole="subheadline" accessibilityRole="alert" style={styles.errorText}>{error}</AdminText> : null}
        <WorkerReviewActions {...props} profilePending={profilePending} reason={reason} requestingChanges={requestingChanges} setReason={(value) => patch({ reason: value })} setRequestingChanges={(value) => patch({ requestingChanges: value })} decideProfile={decideProfile} reviewCopy={reviewCopy} />
      </> : null}
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
    {loading ? <AdminText textRole="subheadline" style={styles.reviewSummaryText}>{language === 'vi' ? 'Đang tải thông tin tài chính...' : 'Loading finance data...'}</AdminText> : error && !finance ? <AdminText textRole="subheadline" style={styles.reviewSummaryText}>{reviewCopy.noFinance}</AdminText> : finance ? <>
      <View style={styles.metaGrid}>
        <MetaItem label={language === 'vi' ? 'Có thể rút' : 'Available'} value={formatters.formatCurrency(finance.available_balance)} />
        <MetaItem label={language === 'vi' ? 'Tạm ghi nhận' : 'Provisional'} value={formatters.formatCurrency(finance.provisional_payment_amount)} />
        <MetaItem label={language === 'vi' ? 'Đang giữ' : 'On hold'} value={formatters.formatCurrency(finance.on_hold_amount)} />
        <MetaItem label={language === 'vi' ? 'Đã reserve rút tiền' : 'Withdrawal reserved'} value={formatters.formatCurrency(finance.withdrawal_reserved_amount)} />
        <MetaItem label={language === 'vi' ? 'Hoa hồng tiền mặt đã thu' : 'Cash commission collected'} value={formatters.formatCurrency(finance.cash_commission_collected_total)} />
        <MetaItem label={language === 'vi' ? 'Hoa hồng tiền mặt còn thiếu' : 'Cash commission due'} value={formatters.formatCurrency(finance.cash_commission_due_total)} />
        <MetaItem label={language === 'vi' ? 'Đã rút' : 'Withdrawn'} value={formatters.formatCurrency(finance.withdrawn_total)} />
        <MetaItem label={language === 'vi' ? 'Chờ Admin xác minh' : 'Pending Admin review'} value={`${finance.provisional_payment_count} · ${formatters.formatCurrency(finance.provisional_payment_amount)}`} />
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
      <MetaItem label={reviewCopy.labels.experience} value={`${profile.years_experience} ${detail.application.language === 'en' ? 'years' : 'năm'}`} />
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
  return <View style={styles.reviewSection}><AdminText textRole="title2" style={styles.reviewSectionTitle}>{reviewCopy.group.history}</AdminText>{detail.history.length ? detail.history.map((item, index) => <View key={`${item.decided_at}-${index}`} style={styles.historyRow}><AdminText textRole="subheadline" style={styles.historyDecision}>{item.stage === 'access' ? reviewCopy.group.access : reviewCopy.group.checklist} · {item.decision}</AdminText>{item.reason ? <AdminText textRole="subheadline" style={styles.historyReason}>{item.reason}</AdminText> : null}<AdminText textRole="subheadline" style={styles.historyReason}>{item.decided_by_name ?? '—'} · {formatDate(item.decided_at)}</AdminText></View>) : <AdminText textRole="subheadline" style={styles.reviewSummaryText}>{reviewCopy.noHistory}</AdminText>}</View>
}

type WorkerReviewActionsProps = WorkerReviewModalProps & {
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
  if (props.requestingChanges) return <View style={styles.modalActionStack}><KaelTextField accessibilityLabel={props.reviewCopy.reasonPlaceholder} multiline value={props.reason} onChangeText={props.setReason} placeholder={props.reviewCopy.reasonPlaceholder} placeholderTextColor={color.text.muted} inputShellStyle={styles.reasonInput} style={styles.reasonText} /><View style={styles.inlineActions}><KaelButton label={props.reviewCopy.actions.close} onPress={() => props.setRequestingChanges(false)} disabled={pending} style={styles.inlineAction} variant="secondary" /><KaelButton label={pending ? props.reviewCopy.actions.saving : props.reviewCopy.actions.requestChanges} onPress={() => { void props.decideProfile('request_changes') }} disabled={pending} style={styles.inlineAction} variant="primary" /></View></View>
  if (worker.stage === 'pending_access' && props.canReview) return <View style={styles.inlineActions}><KaelButton label={props.reviewCopy.actions.approveAccess} onPress={props.onAccessApprove} disabled={pending} style={styles.inlineAction} variant="primary" /><KaelButton label={props.reviewCopy.actions.requestChanges} onPress={props.onAccessRequestChanges} disabled={pending} style={styles.inlineAction} variant="secondary" /><KaelButton label={props.copy.actions.reject} onPress={props.onAccessReject} disabled={pending} style={styles.inlineAction} variant="destructive" /></View>
  if (worker.stage === 'ready_verification' && props.canReview) return <View style={styles.inlineActions}><KaelButton label={pending ? props.reviewCopy.actions.saving : props.reviewCopy.actions.approveProfile} onPress={() => { void props.decideProfile('approve') }} disabled={pending} style={styles.inlineAction} variant="primary" /><KaelButton label={props.reviewCopy.actions.requestChanges} onPress={() => props.setRequestingChanges(true)} disabled={pending} style={styles.inlineAction} variant="secondary" /></View>
  if (props.canManage && worker.worker_profile) return <KaelButton label={worker.worker_profile.is_suspended ? (props.language === 'vi' ? 'Khôi phục hoạt động' : 'Reinstate access') : (props.language === 'vi' ? 'Tạm dừng hoạt động' : 'Suspend access')} onPress={worker.worker_profile.is_suspended ? props.onReinstate : props.onSuspend} disabled={pending} variant={worker.worker_profile.is_suspended ? 'secondary' : 'destructive'} />
  return null
}
