import type { ComponentType } from 'react'
import { Pressable, Text, View, type ImageSourcePropType } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import { KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

import type { WorkerV5IconName } from '../dock/types'
import {
  WorkerV5CustomerCaseWideMintAura,
  WorkerV5CustomerZipMintAura,
  WorkerV5SuccessCheckFill,
  WorkerV5SuccessEmblemAura,
} from '../ui/aura-surfaces'
import { WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import { WorkerV5SuccessEmblem } from '../ui/metrics-surfaces'
import { textByLanguage } from '../ui/format'
import { workerV5ActualWorkDurationLabel } from '../ui/labels'
import { WorkerV5InfoGrid } from './shared-surfaces'
import {
  WorkerV5ActionRail,
  WorkerV5SingleSourceActionButton,
} from './advisory-surfaces'
import {
  WorkerV5ApprovalTimeline,
  WorkerV5ApprovalWaitHero,
  WorkerV5SettlementStrip,
} from './approval-surfaces'
import {
  WorkerV5CaseClosedHero,
  WorkerV5CaseTrailCard,
} from './case-surfaces'
import {
  WorkerV5CompletionEvidenceHero,
  WorkerV5FinalChecklistCard,
  WorkerV5SubmissionTimeline,
  type WorkerV5FinalCheck,
} from './completion-surfaces'
import { WorkerV5EvidenceTray } from './evidence-surfaces'
import type { WorkerV5StatusTimelineBaseProps } from './timeline-surfaces'
import { styles } from './completion-body-styles'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type WorkerV5IconMap = Record<WorkerV5IconName, ImageSourcePropType>
type WorkerV5PrimaryFillComponent = ComponentType<{
  disabled: boolean
  variant?: 'default' | 'source'
}>
type WorkerV5StatusTimelineComponent = ComponentType<WorkerV5StatusTimelineBaseProps>

function buildCompletionChecks(
  deal: LocalDeal | null,
  language: AppLanguage,
  draftPhotoReady = false,
  draftNoteReady = false,
): WorkerV5FinalCheck[] {
  const photoDone = Boolean(deal?.completionPhotoUrls?.length) || draftPhotoReady
  const notesDone = Boolean(deal?.completionNotes?.trim()) || draftNoteReady
  const scope = deal?.scopeChange
  const scopeDone = !scope || scope.status === 'approved_by_customer'
  return [
    {
      done: photoDone,
      meta: photoDone ? textByLanguage(language, 'Đạt', 'Passed') : textByLanguage(language, 'Cần ảnh', 'Needs photo'),
      title: textByLanguage(language, 'Có ảnh trước hoặc sau', 'Has before or after photos'),
    },
    {
      done: notesDone,
      meta: notesDone ? textByLanguage(language, 'Đạt', 'Passed') : textByLanguage(language, 'Cần ghi chú', 'Needs note'),
      title: textByLanguage(language, 'Có ghi chú hoàn tất', 'Has completion note'),
    },
    {
      done: scopeDone,
      meta: scopeDone ? textByLanguage(language, 'Đạt', 'Passed') : textByLanguage(language, 'Đang chờ', 'Pending'),
      title: textByLanguage(language, 'Không còn phạm vi chờ duyệt', 'No pending scope approval'),
    },
  ]
}

export function WorkerV5ApprovalWaitBody({
  language,
  navigateJobChat,
  navigateNext,
  primaryFill,
  reduceTransparency,
  runtime,
  statusTimeline,
}: {
  language: AppLanguage
  navigateJobChat: () => void
  navigateNext: () => void
  primaryFill: WorkerV5PrimaryFillComponent
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
  statusTimeline: WorkerV5StatusTimelineComponent
}) {
  const scope = runtime.state.deal?.scopeChange ?? null
  const approved = scope?.status === 'approved_by_customer'

  return (
    <View style={styles.sectionStack}>
      <WorkerV5ApprovalWaitHero
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        deal={runtime.state.deal}
        language={language}
        reduceTransparency={reduceTransparency}
        scope={scope}
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Theo thời gian thực', 'Real-time')}
        title={textByLanguage(language, 'Trạng thái yêu cầu', 'Request status')}
      />
      <WorkerV5ApprovalTimeline
        language={language}
        reduceTransparency={reduceTransparency}
        scope={scope}
        statusTimeline={statusTimeline}
      />
      <WorkerV5ActionRail
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        primaryButtonFill={primaryFill}
        zipAura={WorkerV5CustomerZipMintAura}
        onPrimary={navigateNext}
        onSecondary={navigateJobChat}
        primary={approved ? textByLanguage(language, 'Tiếp tục công việc', 'Continue work') : textByLanguage(language, 'Chờ khách phê duyệt', 'Waiting for customer approval')}
        primaryDisabled={false}
        primaryTestID="worker-v5-approval-continue-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Nhắn khách', 'Message customer')}
        secondaryTestID="worker-v5-approval-message-action"
      />
    </View>
  )
}

export function WorkerV5CompletionEvidenceBody({
  completionNote,
  draftPhotoUris,
  icons,
  language,
  notice,
  onAddPhoto,
  onCompletionNoteChange,
  onSubmit,
  primaryFill,
  reduceTransparency,
  runtime,
  submitBusy,
  submitDisabled,
}: {
  completionNote: string
  draftPhotoUris: string[]
  icons: WorkerV5IconMap
  language: AppLanguage
  notice: string | null
  onAddPhoto: () => void
  onCompletionNoteChange: (value: string) => void
  onSubmit: () => void
  primaryFill: WorkerV5PrimaryFillComponent
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
  submitBusy: boolean
  submitDisabled: boolean
}) {
  const deal = runtime.state.deal
  const notes = completionNote.trim() || deal?.completionNotes?.trim()
  const evidencePhotoUrls = Array.from(new Set([
    ...(deal?.fieldEvidencePhotoUrls ?? []),
    ...(deal?.completionPhotoUrls ?? []),
    ...draftPhotoUris,
  ]))
  const photoCount = evidencePhotoUrls.length
  const checks = buildCompletionChecks(deal, language, draftPhotoUris.length > 0, Boolean(completionNote.trim()))
  const passedCount = checks.filter((check) => check.done).length

  return (
    <View style={styles.sectionStack}>
      <WorkerV5CompletionEvidenceHero
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        completenessPercent={checks.length ? Math.round((passedCount / checks.length) * 100) : null}
        language={language}
        noteReady={Boolean(notes)}
        photoCount={photoCount}
        reduceTransparency={reduceTransparency}
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5SectionHeader
        action={photoCount ? textByLanguage(language, `${photoCount} ảnh`, `${photoCount} photos`) : textByLanguage(language, 'Trống', 'Empty')}
        title={textByLanguage(language, 'Ảnh trước & sau', 'Before and after photos')}
      />
      <WorkerV5EvidenceTray
        emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
        evidenceIcon={icons.evidence}
        language={language}
        reduceTransparency={reduceTransparency}
        urls={evidencePhotoUrls}
      />
      <WorkerV5SectionHeader
        action={`${passedCount}/${checks.length}`}
        title={textByLanguage(language, 'Kiểm tra cuối', 'Final check')}
      />
      <WorkerV5FinalChecklistCard
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        checks={checks}
        formulaAura
        reduceTransparency={reduceTransparency}
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <View style={styles.completionDraftStack}>
        <KaelTextField
          editable={!submitBusy}
          inputShellStyle={styles.completionNoteShell}
          label={textByLanguage(language, 'Ghi chú hoàn tất', 'Completion note')}
          maxLength={1000}
          multiline
          onChangeText={onCompletionNoteChange}
          placeholder={textByLanguage(language, 'Mô tả việc đã làm và kết quả kiểm tra cuối.', 'Describe the completed work and final check.')}
          placeholderTextColor={color.text.muted}
          style={styles.completionNoteInput}
          testID="worker-v5-completion-note-input"
          value={completionNote}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: submitBusy }}
          disabled={submitBusy}
          onPress={onAddPhoto}
          style={({ pressed }) => [styles.completionPhotoAction, pressed && !submitBusy ? styles.completionPhotoActionPressed : null]}
          testID="worker-v5-completion-add-photo-action"
        >
          <Text style={styles.completionPhotoActionLabel}>
            {textByLanguage(language, 'Thêm ảnh hoàn tất', 'Add completion photo')}
          </Text>
          <Text style={styles.completionPhotoActionMeta}>
            {draftPhotoUris.length > 0
              ? textByLanguage(language, `${draftPhotoUris.length} ảnh đã chọn`, `${draftPhotoUris.length} selected`)
              : textByLanguage(language, 'Cần ít nhất 1 ảnh', 'At least 1 photo required')}
          </Text>
        </Pressable>
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.completionNotice}>{notice}</Text> : null}
      </View>
      <WorkerV5SingleSourceActionButton
        primaryButtonFill={primaryFill}
        disabled={submitDisabled}
        label={submitBusy
          ? textByLanguage(language, 'Đang gửi hồ sơ', 'Submitting completion')
          : textByLanguage(language, 'Gửi hồ sơ hoàn tất', 'Submit completion')}
        onPress={onSubmit}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-completion-submit-action"
      />
    </View>
  )
}

export function WorkerV5CompletionSubmittedBody({
  language,
  navigateNext,
  navigateToEvidence,
  primaryFill,
  reduceMotion,
  reduceTransparency,
  runtime,
  statusTimeline,
}: {
  language: AppLanguage
  navigateNext: () => void
  navigateToEvidence: () => void
  primaryFill: WorkerV5PrimaryFillComponent
  reduceMotion: boolean
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
  statusTimeline: WorkerV5StatusTimelineComponent
}) {
  const deal = runtime.state.deal
  const sourceCount = (deal?.completionPhotoUrls?.length ?? 0) + (deal?.completionNotes?.trim() ? 1 : 0)
  const customerConfirmed = deal?.status === 'confirmed_by_customer' || deal?.status === 'payment_pending' || deal?.status === 'paid' || deal?.status === 'reviewed'

  return (
    <View style={styles.sectionStack}>
      <WorkerV5SuccessEmblem
        body={deal
          ? sourceCount
            ? textByLanguage(language, `Khách đang xem ${sourceCount} nguồn bằng chứng và tổng thanh toán.`, `The customer is reviewing ${sourceCount} evidence sources and the payment total.`)
            : textByLanguage(language, 'Hệ thống chưa có nguồn bằng chứng hoàn tất để gửi.', 'The system has no completion evidence sources to submit yet.')
          : textByLanguage(language, 'Chỉ hiển thị khi NestScout ghi nhận hồ sơ hoàn tất thật.', 'Shown only when NestScout records a real completion artifact.')}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
        status={customerConfirmed ? textByLanguage(language, 'Đã xác nhận', 'Confirmed') : textByLanguage(language, 'Đang chờ khách xác nhận', 'Waiting for customer confirmation')}
        title={deal ? textByLanguage(language, 'Đã gửi hồ sơ', 'Completion artifact submitted') : textByLanguage(language, 'Chưa có hồ sơ đã gửi', 'No submitted artifact')}
        waitingForCustomer={!customerConfirmed}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Tự động cập nhật', 'Auto update')}
        title={textByLanguage(language, 'Tiến trình', 'Progress')}
      />
      <WorkerV5SubmissionTimeline
        deal={deal}
        language={language}
        reduceTransparency={reduceTransparency}
        statusTimeline={statusTimeline}
      />
      <WorkerV5SettlementStrip
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        deal={deal}
        language={language}
        reduceTransparency={reduceTransparency}
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5ActionRail
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        primaryButtonFill={primaryFill}
        zipAura={WorkerV5CustomerZipMintAura}
        onPrimary={navigateNext}
        onSecondary={navigateToEvidence}
        primary={customerConfirmed ? textByLanguage(language, 'Mở Case đã đóng', 'Open closed case') : textByLanguage(language, 'Chờ khách xác nhận', 'Waiting for customer')}
        primaryTestID="worker-v5-completion-submitted-next-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Xem bằng chứng', 'View evidence')}
        secondaryTestID="worker-v5-completion-submitted-timeline-action"
      />
    </View>
  )
}

export function WorkerV5CaseClosedBody({
  completionRecordIcon,
  incomeLedgerIcon,
  language,
  navigateToEarnings,
  navigateToRanking,
  primaryFill,
  reduceTransparency,
  runtime,
}: {
  completionRecordIcon: ImageSourcePropType
  incomeLedgerIcon: ImageSourcePropType
  language: AppLanguage
  navigateToEarnings: () => void
  navigateToRanking: () => void
  primaryFill: WorkerV5PrimaryFillComponent
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const payment = deal?.payment
  const workerNet = payment?.workerNet ?? runtime.workerEarnings?.net_earnings ?? null
  const rating = runtime.workerPerformanceInsights?.average_rating ?? runtime.workerProfile?.rating ?? null
  const hasRating = typeof rating === 'number' && rating > 0
  const rankingDelta = runtime.workerPerformanceInsights?.performance_score ?? null

  return (
    <View style={styles.sectionStack}>
      <WorkerV5CaseClosedHero
        deal={deal}
        language={language}
        reduceTransparency={reduceTransparency}
        successCheckFill={WorkerV5SuccessCheckFill}
        successEmblemAura={WorkerV5SuccessEmblemAura}
        workerNet={workerNet}
      />
      <WorkerV5InfoGrid
        auraScope="CaseClosed"
        items={[
          { label: textByLanguage(language, 'Đánh giá Case', 'Case rating'), value: hasRating ? `${rating.toFixed(rating % 1 === 0 ? 0 : 1)} ★` : textByLanguage(language, 'Chưa có', 'None') },
          { label: textByLanguage(language, 'Thời gian thực tế', 'Actual time'), value: workerV5ActualWorkDurationLabel(deal, language) },
          { label: textByLanguage(language, 'Điểm xếp hạng', 'Ranking points'), value: rankingDelta && rankingDelta > 0 ? `+${Math.round(rankingDelta)}` : textByLanguage(language, 'Chưa có', 'None') },
        ]}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5CaseTrailCard
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        completionRecordIcon={completionRecordIcon}
        deal={deal}
        incomeLedgerIcon={incomeLedgerIcon}
        language={language}
        reduceTransparency={reduceTransparency}
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5ActionRail
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        primaryButtonFill={primaryFill}
        zipAura={WorkerV5CustomerZipMintAura}
        onPrimary={navigateToEarnings}
        onSecondary={navigateToRanking}
        primary={textByLanguage(language, 'Mở thu nhập', 'Open earnings')}
        primaryTestID="worker-v5-case-closed-earnings-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Xem điểm hạng', 'View ranking')}
        secondaryTestID="worker-v5-case-closed-ranking-action"
      />
    </View>
  )
}
