import { formatWorkerMoney } from './chat-helpers'
import { workerActionCopy } from './copy'
import { styles } from './styles'
import { workerDiagnosisSurface, workerJobCardSurface } from './surface-styles/glass-earnings'
import { type WorkerIconName, type WorkerLanguageMode, type WorkerTone } from './types'
import { localizedStatusLabel } from '@/lib/app-language'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { hasLocalDealCompletionEvidence, type LocalKaelProgress, workflowArtifactModeLabel, workflowBlockedReasonLabel, type WorkflowPhaseContext, workflowSourceOfTruthLabel } from '@nestscout/shared'
import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'
import { JobRoomMetaCell } from './job-offer'
import { PressButton, SubtleGlassHighlight, WorkerJobsCardChrome, WorkerUtilityIcon, getWorkerVisibleDeal, useWorkerUi } from './ui'

export function workerWorkflowSectionSummary(sections: WorkflowPhaseContext['sections'], language: WorkerLanguageMode) {
  const labels = sections.slice(0, 3).map((section) => {
    const mode = section.mode ? workflowArtifactModeLabel(section.mode, language) : workflowSourceOfTruthLabel(section.sourceOfTruth, language)
    return `${section.title[language]} · ${mode}`
  })
  if (sections.length > 3) {
    labels.push(language === 'en' ? `+${sections.length - 3} more` : `+${sections.length - 3} mục nữa`)
  }
  return labels.length > 0 ? labels.join('\n') : (language === 'en' ? 'No visible section yet' : 'Chưa có mục hiển thị')
}

function resolveWorkerScopeProgressLabel(progress: LocalKaelProgress | null, language: WorkerLanguageMode) {
  if (!progress) return language === 'en' ? 'Kael is reviewing' : 'Kael đang xét'
  if (progress.status === 'failed') return language === 'en' ? 'Needs retry' : 'Cần thử lại'
  if (progress.current_stage === 'scope_reviewing') {
    return language === 'en' ? 'Kael is reviewing evidence' : 'Kael đang rà soát bằng chứng'
  }
  if (progress.current_stage === 'scope_estimating') {
    if (progress.status === 'completed') {
      return language === 'en' ? 'Kael estimate ready' : 'Kael đã tính xong'
    }
    return language === 'en' ? 'Kael is estimating' : 'Kael đang tính phạm vi'
  }
  return language === 'en' ? 'Kael is reviewing' : 'Kael đang xét'
}

function resolveWorkerScopeProgressBody(
  progress: LocalKaelProgress | null,
  fallbackBody: string,
  language: WorkerLanguageMode,
) {
  if (!progress) return fallbackBody
  if (progress.status === 'failed') {
    return language === 'en'
      ? 'Kael could not finish this scope review yet. The job stays app-owned and price changes must be retried from the job room.'
      : 'Kael chưa hoàn tất phần xét phạm vi này. Việc vẫn thuộc app và thay đổi giá cần thử lại trong phòng việc.'
  }
  if (progress.current_stage === 'scope_reviewing') {
    return language === 'en'
      ? 'Kael is checking the worker report and attached evidence before any price decision appears.'
      : 'Kael đang kiểm tra mô tả của thợ và bằng chứng đã gửi trước khi hiện quyết định giá.'
  }
  if (progress.current_stage === 'scope_estimating') {
    if (progress.status === 'completed') {
      return language === 'en'
        ? 'Kael has prepared the scope estimate. The customer still decides inside the app before work continues.'
        : 'Kael đã chuẩn bị ước tính phạm vi. Khách vẫn quyết định trong app trước khi tiếp tục.'
    }
    return language === 'en'
      ? 'Kael is turning the reviewed evidence into an app-owned scope estimate.'
      : 'Kael đang chuyển bằng chứng đã rà soát thành ước tính phạm vi thuộc app.'
  }
  return fallbackBody
}

function resolveWorkerScopeProgressValue(progress: LocalKaelProgress | null, language: WorkerLanguageMode) {
  if (!progress) return language === 'en' ? 'Waiting for live state' : 'Chờ trạng thái thật'
  const percent = `${Math.round(Math.max(0, Math.min(1, progress.progress)) * 100)}%`
  const status = progress.status === 'completed'
    ? (language === 'en' ? 'done' : 'xong')
    : progress.status === 'failed'
      ? (language === 'en' ? 'failed' : 'lỗi')
      : progress.status === 'queued'
        ? (language === 'en' ? 'queued' : 'đang chờ')
        : (language === 'en' ? 'running' : 'đang chạy')
  return `${percent} · ${status}`
}

export function WorkerNeedsReviewCard() {
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()
  const { selectors, state } = useFrontendWorkflow()
  const actionCopy = workerActionCopy[language]
  const deal = getWorkerVisibleDeal(state.deal)
  const scopeChange = deal?.scopeChange ?? null
  const hasScopeBlocker = Boolean(deal && selectors.currentStatus === 'scope_change_pending' && scopeChange)
  const hasCompletionEvidenceBlocker = Boolean(deal && selectors.currentStatus === 'repairing')
  const hasSubmittedCompletionEvidenceGap = Boolean(
    deal &&
    selectors.currentStatus === 'completed_by_worker' &&
    !hasLocalDealCompletionEvidence(deal),
  )
  const hasCompletionEvidenceArtifact = Boolean(
    deal &&
    hasLocalDealCompletionEvidence(deal) &&
    selectors.currentStatus &&
    ['completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(selectors.currentStatus),
  )

  if (!hasScopeBlocker && !hasCompletionEvidenceBlocker && !hasSubmittedCompletionEvidenceGap && !hasCompletionEvidenceArtifact) {
    return (
      <>
        <WorkerNeedsEmptyCard
          body={copy.jobs.needsEmptyBody}
          icon="brief"
          testID="worker-scope-change-empty"
          title={copy.jobs.needsEmptyTitle}
          tone="warm"
        />
        <WorkerNeedsEmptyCard
          body={language === 'en' ? 'Completion notes and photos appear here when a job reaches the finish step.' : 'Ghi chú và ảnh nghiệm thu sẽ hiện ở đây khi việc tới bước hoàn tất.'}
          icon="evidence"
          testID="worker-completion-evidence-empty"
          title={language === 'en' ? 'Completion evidence' : 'Ảnh nghiệm thu'}
          tone="base"
        />
      </>
    )
  }

  if (hasSubmittedCompletionEvidenceGap && deal) {
    const hasEnoughNote = (deal.completionNotes?.trim().length ?? 0) >= 5
    const hasPhoto = (deal.completionPhotoUrls?.length ?? 0) > 0
    const gapMeta = language === 'en'
      ? `${hasEnoughNote ? 'Notes saved' : 'Notes missing'} · ${hasPhoto ? 'Photos saved' : 'Photos missing'}`
      : `${hasEnoughNote ? 'Đã có ghi chú' : 'Thiếu ghi chú'} · ${hasPhoto ? 'Đã có ảnh' : 'Thiếu ảnh'}`
    return (
      <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-completion-evidence-missing-card">
        <WorkerJobsCardChrome />
        <View style={styles.identityRow}>
          <WorkerUtilityIcon active frameSize={48} icon="evidence" size={48} style={styles.needsInlineImageIcon} />
          <View style={styles.titleStack}>
            <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
              {language === 'en' ? 'Evidence gate' : 'Cổng bằng chứng'}
            </Text>
            <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
              {language === 'en' ? 'Completion evidence is incomplete' : 'Bằng chứng hoàn tất chưa đủ'}
            </Text>
          </View>
        </View>
        <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
          {language === 'en'
            ? 'Kael needs both worker notes and completion photos before this artifact can move forward. Final price remains Kael-owned.'
            : 'Kael cần cả ghi chú thợ và ảnh hoàn tất trước khi dấu mốc này đi tiếp. Giá cuối vẫn thuộc quyết định của Kael.'}
        </Text>
        <View style={styles.needsReviewGrid}>
          <JobRoomMetaCell label={language === 'en' ? 'Missing' : 'Còn thiếu'} value={gapMeta} valueLines={2} />
          <JobRoomMetaCell label={language === 'en' ? 'Gate' : 'Cổng'} value={workflowBlockedReasonLabel('completion_evidence_required', language)} />
        </View>
        <PressButton secondary label={copy.jobs.jobRoomCta} onPress={() => replace('/(worker)/chat')} testID="worker-needs-open-missing-completion-jobroom" />
      </View>
    )
  }

  if (hasCompletionEvidenceBlocker) {
    return (
      <>
        <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-completion-evidence-blocker-card">
          <WorkerJobsCardChrome />
          <View style={styles.identityRow}>
            <WorkerUtilityIcon active frameSize={48} icon="evidence" size={48} style={styles.needsInlineImageIcon} />
            <View style={styles.titleStack}>
              <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
                {language === 'en' ? 'Update needed' : 'Cần cập nhật'}
              </Text>
              <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
                {language === 'en' ? 'Completion photos are missing' : 'Ảnh nghiệm thu còn thiếu'}
              </Text>
            </View>
            <Text style={[styles.statusPill, { backgroundColor: tokens.mint, borderColor: tokens.border, color: tokens.primary }]} numberOfLines={1}>
              {language === 'en' ? 'Evidence' : 'Bằng chứng'}
            </Text>
          </View>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
            {language === 'en'
              ? 'Before marking the job complete, add after-repair photos and a short note so the evidence trail stays complete.'
              : 'Trước khi đánh dấu hoàn tất, cần gửi ảnh sau sửa và ghi chú ngắn để giữ chuỗi bằng chứng đầy đủ.'}
          </Text>
          <View style={styles.actionRow}>
            <PressButton label={actionCopy.addCompletionPhoto} onPress={() => replace('/(worker)/jobs?tab=needs')} testID="worker-needs-add-completion-photo" />
            <PressButton secondary label={actionCopy.completeLater} onPress={() => replace('/(worker)/jobs?tab=active')} testID="worker-needs-completion-later" />
          </View>
        </View>
      </>
    )
  }

  if (hasCompletionEvidenceArtifact && deal) {
    const photoCount = deal.completionPhotoUrls?.length ?? 0
    const note = deal.completionNotes?.trim() || (language === 'en' ? 'Completion note saved by the system.' : 'Ghi chú hoàn tất đã được hệ thống lưu.')
    const statusLabel = localizedStatusLabel(selectors.currentStatus, language)
    const statusBody = selectors.currentStatus === 'completed_by_worker'
      ? language === 'en'
        ? 'Kael is reviewing the submitted evidence before completion or payment moves forward.'
        : 'Kael đang rà soát bằng chứng đã gửi trước khi chuyển hoàn tất hoặc thanh toán.'
      : language === 'en'
        ? 'Completion evidence is preserved as a read-only artifact for this job.'
        : 'Bằng chứng hoàn tất được giữ lại như dấu mốc chỉ đọc của công việc này.'
    const photoLabel = language === 'en'
      ? `${photoCount} completion photo${photoCount === 1 ? '' : 's'}`
      : `${photoCount} ảnh nghiệm thu`

    return (
      <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-completion-evidence-submitted-card">
        <WorkerJobsCardChrome />
        <View style={styles.identityRow}>
          <WorkerUtilityIcon active frameSize={48} icon="evidence" size={48} style={styles.needsInlineImageIcon} />
          <View style={styles.titleStack}>
            <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
              {statusLabel}
            </Text>
            <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
              {language === 'en' ? 'Completion evidence submitted' : 'Đã gửi bằng chứng hoàn tất'}
            </Text>
          </View>
          <Text style={[styles.statusPill, { backgroundColor: tokens.mint, borderColor: tokens.border, color: tokens.primary }]} numberOfLines={1}>
            {language === 'en' ? 'Read-only' : 'Chỉ đọc'}
          </Text>
        </View>
        <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
          {statusBody}
        </Text>
        <View style={styles.needsReviewGrid}>
          <JobRoomMetaCell label={language === 'en' ? 'Completion note' : 'Ghi chú hoàn tất'} value={note} valueLines={3} />
          <JobRoomMetaCell label={language === 'en' ? 'Media' : 'Ảnh/video'} value={photoLabel} />
          <JobRoomMetaCell label={language === 'en' ? 'Kael gate' : 'Cổng Kael'} value={statusLabel} />
        </View>
        <View style={styles.actionRow}>
          <PressButton secondary label={copy.jobs.jobRoomCta} onPress={() => replace('/(worker)/chat')} testID="worker-needs-open-completion-jobroom" />
        </View>
      </View>
    )
  }

  const requestedScope = scopeChange?.requestedDescription ?? copy.jobs.scopeBody
  const scopeProgress = scopeChange?.kaelProgress ?? null
  const scopeProgressLabel = resolveWorkerScopeProgressLabel(scopeProgress, language)
  const scopeProgressBody = resolveWorkerScopeProgressBody(scopeProgress, copy.jobs.scopeBody, language)
  const scopeProgressValue = resolveWorkerScopeProgressValue(scopeProgress, language)
  const missingReasonLabel = language === 'en' ? 'Waiting for worker evidence' : 'Chờ bằng chứng từ thợ'
  const missingEstimateLabel = language === 'en' ? 'Waiting for Kael estimate' : 'Chờ Kael ước tính'
  const pendingPriceDecisionLabel = scopeProgressLabel
  const reason = scopeChange?.reason?.trim() || missingReasonLabel
  const originalScope = deal?.draft.description || deal?.draft.inferredProblemLabel || copy.jobs.scopeBody
  const originalPrice = deal?.estimate?.priceRangeLabel ?? missingEstimateLabel
  const price =
    scopeChange?.priceMin && scopeChange.priceMax
      ? `${formatWorkerMoney(scopeChange.priceMin, language)} - ${formatWorkerMoney(scopeChange.priceMax, language)}`
      : pendingPriceDecisionLabel
  const scopeSummary = reason === missingReasonLabel ? requestedScope : `${requestedScope}. ${reason}`

  return (
    <>
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-scope-change-active">
      <WorkerJobsCardChrome tone="warm" />
      <View style={styles.identityRow}>
        <WorkerUtilityIcon active frameSize={48} icon="brief" size={48} style={styles.needsInlineImageIcon} />
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.cream, borderColor: tokens.border, borderWidth: 1, color: tokens.copper }]} numberOfLines={1}>
            {scopeProgressLabel}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {copy.jobs.scopeTitle}
          </Text>
        </View>
      </View>
      <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
        {scopeProgressBody}
      </Text>
      <View style={[styles.jobDiagnosisBox, workerDiagnosisSurface(tokens)]} testID="worker-scope-change-kael-summary">
        <Text style={[styles.kaelBriefTitle, { color: tokens.ink }]} numberOfLines={1}>
          {copy.chat.briefTitle}
        </Text>
        <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={3}>
          {scopeSummary}
        </Text>
      </View>
      <View style={styles.needsReviewGrid}>
        <JobRoomMetaCell label={language === 'en' ? 'Current scope' : 'Phạm vi hiện tại'} value={originalScope} />
        <JobRoomMetaCell label={language === 'en' ? 'Current estimate' : 'Ước tính hiện tại'} value={originalPrice} />
        <JobRoomMetaCell label={language === 'en' ? 'Requested work' : 'Phần việc mới'} value={requestedScope} />
        <JobRoomMetaCell label={language === 'en' ? 'Reason' : 'Lý do'} value={reason} />
        <JobRoomMetaCell label={language === 'en' ? 'Kael progress' : 'Tiến trình Kael'} value={scopeProgressValue} />
        <JobRoomMetaCell label={language === 'en' ? 'Kael price decision' : 'Giá Kael xét'} value={price} />
      </View>
      <View style={styles.actionRow}>
        <PressButton secondary label={copy.jobs.jobRoomCta} onPress={() => replace('/(worker)/chat')} testID="worker-needs-open-jobroom" />
      </View>
    </View>
    </>
  )
}

export function WorkerNeedsInlineEmptyCard() {
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()

  return (
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens, 'warm')]} testID="worker-jobs-active-needs-inline-empty-card">
      <WorkerJobsCardChrome tone="warm" />
      <SubtleGlassHighlight />
      <View style={[styles.jobTopRow, styles.needsTopRow]}>
        <View style={[styles.titleStack, styles.needsTextStack]}>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {copy.jobs.needsEmptyTitle}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2}>
            {copy.jobs.needsEmptyBody}
          </Text>
        </View>
      </View>
      <View style={styles.actionRow}>
        <PressButton label={language === 'en' ? 'View request' : 'Xem yêu cầu'} onPress={() => replace('/(worker)/jobs?tab=needs')} testID="worker-jobs-active-needs-inline-primary" />
        <PressButton secondary label={language === 'en' ? 'Message Kael' : 'Nhắn Kael'} onPress={() => replace('/(worker)/chat')} testID="worker-jobs-active-needs-inline-secondary" />
      </View>
    </View>
  )
}

function WorkerNeedsEmptyCard({
  body,
  icon,
  testID,
  title,
  tone = 'base',
}: {
  body: string
  icon: WorkerIconName
  testID: string
  title: string
  tone?: WorkerTone
}) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens, tone)]} testID={testID}>
      <WorkerJobsCardChrome tone={tone} />
      <View style={[styles.jobTopRow, styles.needsTopRow]}>
        <WorkerUtilityIcon active frameSize={64} icon={icon} size={64} small style={styles.needsImageIcon} />
        <View style={[styles.titleStack, styles.needsTextStack]}>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
            {body}
          </Text>
        </View>
      </View>
    </View>
  )
}
