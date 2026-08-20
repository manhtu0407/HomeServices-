import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import { localizeMediaUploadFailure, uploadJobMediaDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'
import type { AppLanguage } from '@/lib/app-language'
import { formatVnd, textByLanguage } from '../ui/format'
import { workerV5PrivateKaelMediaName } from '../chat/use-worker-kael-orb-chat'
import { WorkerV5EvidenceTray } from './evidence-surfaces'
import { WorkerV5InProgressBody } from './in-progress-surfaces'
import { WorkerV5ProgressRail } from './progress-surfaces'
import { WorkerV5ScopeChangeBody } from './scope-change-body-surfaces'
import { useWorkerV5ScopeChangeActions } from './use-worker-scope-change-actions'
import {
  Text,
  WorkerJobsLegacyPrototypeMetaIcon,
  WorkerJobsLegacyPrototypeStageActionButton,
  type WorkerJobsLegacyPrototypeRuntime,
  workerJobsLegacyPrototypeStageEightCompletionWorkart,
  workerJobsLegacyPrototypeStageSevenArtwork,
} from './worker-jobs-zip-prototype-shared'
import { prototypeStyles } from './worker-jobs-zip-prototype-styles'

export function WorkerJobsLegacyPrototypeStageFiveBody({
  actionBusy,
  language,
  navigateActiveJobChat,
  navigateNext,
  reduceTransparency,
  runRouteAction,
  runtime,
}: {
  actionBusy: boolean
  language: AppLanguage
  navigateActiveJobChat: () => void
  navigateNext: () => void
  reduceTransparency: boolean
  runRouteAction: () => void | Promise<void>
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const deal = runtime.state.deal
  if (deal) {
    return (
      <View style={prototypeStyles.bodyStack}>
        <WorkerV5InProgressBody
          actionBusy={actionBusy}
          language={language}
          navigateJobChat={navigateActiveJobChat}
          onTravelAction={() => void runRouteAction()}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
          styleVariant="jobs-review"
        />
      </View>
    )
  }

  const evidenceSlots = [null, null, null]
  return (
    <View style={prototypeStyles.bodyStack} testID="worker-v5-stage-five-prototype">
      <View style={[prototypeStyles.stageSummaryCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-stage-five-summary-card">
        <View style={prototypeStyles.stageSummaryCopy}>
          <Text style={prototypeStyles.stageSummaryEyebrow}>{textByLanguage(language, 'Tiến độ theo trạng thái', 'Progress by status')}</Text>
          <Text style={prototypeStyles.stageSummaryTitle}>{textByLanguage(language, 'Chưa có việc', 'No active job')}</Text>
          <Text style={prototypeStyles.stageSummaryMeta}>{textByLanguage(language, 'Chờ nguồn kiểm tra thật từ việc', 'Waiting for real job data')}</Text>
        </View>
        <View style={prototypeStyles.stageSummaryCount}>
          <Text style={prototypeStyles.stageSummaryCountText}>0/5</Text>
        </View>
      </View>

      <View style={prototypeStyles.stageSectionHeader}>
        <Text style={prototypeStyles.stageSectionTitle}>{textByLanguage(language, 'Bằng chứng hiện trường', 'On-site evidence')}</Text>
        <Text style={prototypeStyles.stageSectionAction}>{textByLanguage(language, 'Chưa có', 'None')}</Text>
      </View>

      <View style={prototypeStyles.stageEvidenceRow} testID="worker-v5-stage-five-evidence-slots">
        {evidenceSlots.map((url, index) => (
          <Pressable
            accessibilityLabel={textByLanguage(language, 'Thêm ảnh', 'Add photo')}
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            disabled
            key={`stage-five-slot-${index}`}
            style={[prototypeStyles.stageEvidenceSlot, prototypeStyles.stageEvidenceSlotDisabled]}
            testID={`worker-v5-stage-five-evidence-slot-${index}`}
          >
            {url ? <Image contentFit="cover" source={{ uri: url }} style={prototypeStyles.stageEvidenceImage} /> : <Text style={prototypeStyles.stageEvidencePlus}>+</Text>}
          </Pressable>
        ))}
      </View>

      <View style={prototypeStyles.stageActionRow}>
        <WorkerJobsLegacyPrototypeStageActionButton
          label={textByLanguage(language, 'Hỏi Kael', 'Ask Kael')}
          onPress={navigateActiveJobChat}
          testID="worker-v5-stage-five-kael-action"
        />
        <WorkerJobsLegacyPrototypeStageActionButton
          label={textByLanguage(language, 'Báo đổi phạm vi', 'Report scope change')}
          onPress={navigateNext}
          primary
          testID="worker-v5-stage-five-scope-action"
        />
      </View>
    </View>
  )
}

export function WorkerJobsLegacyPrototypeStageSixBody({
  language,
  navigateJobChat,
  navigateNext,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateJobChat: () => void
  navigateNext: () => void
  reduceTransparency: boolean
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const scopeChange = useWorkerV5ScopeChangeActions({ deal: runtime.state.deal, language, runtime })
  if (scopeChange.scopeEvidenceOpen) {
    return <View style={prototypeStyles.bodyStack}><WorkerV5ScopeChangeBody language={language} navigateNext={navigateNext} reduceTransparency={reduceTransparency} runtime={runtime} /></View>
  }

  const proposalSubmitted = scopeChange.jobIncident?.status === 'scope_proposed'
  const proposalReady = scopeChange.jobIncident?.status === 'ready_for_scope_proposal'
  const proposalRows = [
    {
      label: textByLanguage(language, 'Hạng mục bổ sung', 'Additional scope'),
      value: scopeChange.scope?.requestedDescription || textByLanguage(language, 'Chưa có bản nháp thật', 'No real draft'),
    },
    {
      label: textByLanguage(language, 'Lý do', 'Reason'),
      value: scopeChange.scope?.reason || textByLanguage(language, 'Chưa có lý do thật', 'No real reason'),
    },
    {
      label: textByLanguage(language, 'Bằng chứng', 'Evidence'),
      value: scopeChange.evidenceCount ? textByLanguage(language, `${scopeChange.evidenceCount} ảnh`, `${scopeChange.evidenceCount} photos`) : textByLanguage(language, 'Chưa có ảnh', 'No photos'),
    },
  ]
  const totalValue = scopeChange.scopeQuote
    ? formatVnd(scopeChange.scopeQuote.customer_total, language)
    : scopeChange.price
  const primaryAction = proposalSubmitted
    ? scopeChange.onViewScopeDetails
    : proposalReady
      ? scopeChange.scopeQuote ? scopeChange.onSubmitScopeProposal : scopeChange.onPreviewScopeProposal
      : navigateNext
  const primaryLabel = proposalSubmitted
    ? textByLanguage(language, 'Đang chờ khách xác nhận', 'Waiting for customer approval')
    : proposalReady
      ? scopeChange.scopeQuote
        ? textByLanguage(language, 'Xác nhận giá và gửi khách', 'Confirm price and send')
        : scopeChange.scopeQuoting
          ? textByLanguage(language, 'Kael đang tính...', 'Kael is calculating...')
          : textByLanguage(language, 'Kael tính giá cân bằng', 'Calculate balanced price')
      : textByLanguage(language, 'Không phát sinh', 'No scope issue')
  const secondaryDisabled = !scopeChange.canDraftScopeEvidence || proposalSubmitted

  return (
    <View style={prototypeStyles.bodyStack} testID="worker-v5-stage-six-prototype">
      <WorkerV5ProgressRail activeStep={4} formulaAura={false} language={language} reduceTransparency={reduceTransparency} />

      <View style={[prototypeStyles.stageProposalCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-stage-six-proposal-card">
        <View style={prototypeStyles.stageProposalHeader}>
          <View style={prototypeStyles.stageProposalIcon}>
            <WorkerJobsLegacyPrototypeMetaIcon kind="status" size={28} />
          </View>
          <View style={prototypeStyles.stageProposalHeaderCopy}>
            <Text style={prototypeStyles.stageProposalKicker}>{textByLanguage(language, 'Đề xuất thay đổi', 'Change proposal')}</Text>
            <Text style={prototypeStyles.stageProposalTitle}>{textByLanguage(language, 'Phạm vi công việc', 'Work scope')}</Text>
          </View>
          <Text style={prototypeStyles.stageProposalAction}>{textByLanguage(language, 'Kael hỗ trợ soạn', 'Kael drafts')}</Text>
        </View>
        {proposalRows.map((row) => (
          <View key={row.label} style={prototypeStyles.stageProposalRow}>
            <Text numberOfLines={1} style={prototypeStyles.stageProposalLabel}>{row.label}</Text>
            <Text numberOfLines={2} style={prototypeStyles.stageProposalValue}>{row.value}</Text>
          </View>
        ))}
        <View style={[prototypeStyles.stageProposalRow, prototypeStyles.stageProposalRowLast]}>
          <Text style={prototypeStyles.stageProposalLabel}>{textByLanguage(language, 'Khoảng giá', 'Price range')}</Text>
          <Text numberOfLines={2} style={[prototypeStyles.stageProposalValue, prototypeStyles.stageProposalTotalValue]}>{totalValue}</Text>
        </View>
      </View>

      {scopeChange.scopeEvidenceUrls.length > 0 ? (
        <WorkerV5EvidenceTray
          emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
          language={language}
          reduceTransparency={reduceTransparency}
          stageLabel={textByLanguage(language, 'Bằng chứng đổi phạm vi', 'Scope-change evidence')}
          urls={scopeChange.scopeEvidenceUrls}
        />
      ) : (
        <View style={[prototypeStyles.stageEvidenceEmpty, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-stage-six-evidence-empty">
        <View style={prototypeStyles.stageEvidenceEmptyIcon}>
          <WorkerJobsLegacyPrototypeMetaIcon kind="price" size={22} />
        </View>
          <Text style={prototypeStyles.stageEvidenceEmptyText}>{textByLanguage(language, 'Chưa có', 'None')}</Text>
        </View>
      )}

      <View style={prototypeStyles.stageActionRow}>
        <WorkerJobsLegacyPrototypeStageActionButton
          disabled={secondaryDisabled}
          label={textByLanguage(language, 'Chỉnh sửa', 'Edit')}
          onPress={scopeChange.onOpenScopeEditPath}
          testID="worker-v5-stage-six-edit-action"
        />
        <WorkerJobsLegacyPrototypeStageActionButton
          label={primaryLabel}
          onPress={() => void primaryAction()}
          primary
          testID="worker-v5-stage-six-primary-action"
        />
      </View>

      {scopeChange.scopeMediaNotice ? <Text style={prototypeStyles.stageSummaryMeta}>{scopeChange.scopeMediaNotice}</Text> : null}
      {proposalSubmitted ? <Text style={prototypeStyles.stageSummaryMeta}>{textByLanguage(language, 'Khách đang xem đề xuất.', 'The customer is reviewing the proposal.')}</Text> : null}
      {!proposalSubmitted && !proposalReady && scopeChange.hasScopeSubmission ? <WorkerJobsLegacyPrototypeStageActionButton label={textByLanguage(language, 'Hỏi Kael', 'Ask Kael')} onPress={navigateJobChat} testID="worker-v5-stage-six-kael-action" /> : null}
    </View>
  )
}

export function WorkerJobsLegacyPrototypeStageSevenBody({
  language,
  navigateJobChat,
  navigateNext,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateJobChat: () => void
  navigateNext: () => void
  reduceTransparency: boolean
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const deal = runtime.state.deal
  const scope = deal?.scopeChange ?? null
  const approved = scope?.status === 'approved_by_customer'
  const rejected = scope?.status === 'rejected_by_customer' || scope?.status === 'cancelled'
  const kaelDone = scope?.kaelProgress?.status === 'completed'
  const proposalTitle = scope?.requestedDescription?.trim() || textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')
  const proposalMeta = scope
    ? textByLanguage(language, 'Kael đã kiểm tra. Chờ khách quyết định.', 'Kael checked the request. Waiting for the customer.')
    : textByLanguage(language, 'Chưa có đề xuất thật để hiển thị.', 'No real proposal to display yet.')
  const statusLabel = approved
    ? textByLanguage(language, 'Đã duyệt', 'Approved')
    : rejected
      ? textByLanguage(language, 'Đã đóng', 'Closed')
      : textByLanguage(language, 'Chờ khách duyệt', 'Waiting for customer')
  const timelineRows: { meta: string; state: 'active' | 'done' | 'todo'; title: string }[] = [
    {
      meta: scope ? textByLanguage(language, 'Đề xuất đã gửi', 'Proposal sent') : textByLanguage(language, 'Chưa có dữ liệu thật', 'No real data yet'),
      state: scope ? 'done' : 'todo',
      title: textByLanguage(language, 'Bạn gửi đề xuất', 'You sent the proposal'),
    },
    {
      meta: kaelDone ? textByLanguage(language, 'Đã kiểm tra ràng buộc', 'Constraints checked') : textByLanguage(language, 'Chưa có kết quả kiểm tra', 'No review result yet'),
      state: kaelDone ? 'done' : scope ? 'active' : 'todo',
      title: textByLanguage(language, 'Kael kiểm tra', 'Kael checks'),
    },
    {
      meta: approved
        ? textByLanguage(language, 'Khách đã duyệt', 'Customer approved')
        : rejected
          ? textByLanguage(language, 'Yêu cầu đã đóng', 'Request closed')
          : textByLanguage(language, 'Chờ khách quyết định', 'Waiting for customer decision'),
      state: approved || rejected ? 'done' : scope ? 'active' : 'todo',
      title: textByLanguage(language, 'Khách phê duyệt', 'Customer reviews'),
    },
    {
      meta: approved ? textByLanguage(language, 'Có thể tiếp tục', 'Ready to continue') : textByLanguage(language, 'Sau khi có quyết định', 'After a decision'),
      state: approved ? 'active' : 'todo',
      title: textByLanguage(language, 'Tiếp tục công việc', 'Continue work'),
    },
  ]

  return (
    <View style={prototypeStyles.bodyStack} testID="worker-v5-stage-seven-prototype">
      <View style={[prototypeStyles.stageSevenHero, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-stage-seven-hero">
        <View style={prototypeStyles.stageSevenCopy}>
          <Text style={prototypeStyles.stageSevenKicker}>{textByLanguage(language, 'Trạng thái đề xuất', 'Proposal status')}</Text>
          <Text numberOfLines={2} style={prototypeStyles.stageSevenTitle}>{proposalTitle}</Text>
          <Text numberOfLines={2} style={prototypeStyles.stageSevenMeta}>{proposalMeta}</Text>
          <View style={prototypeStyles.stageSevenStatus}>
            <WorkerJobsLegacyPrototypeMetaIcon kind="status" size={18} />
            <Text style={prototypeStyles.stageSevenStatusText}>{statusLabel}</Text>
          </View>
        </View>
        <Image contentFit="contain" source={workerJobsLegacyPrototypeStageSevenArtwork} style={prototypeStyles.stageSevenArtwork} />
      </View>

      <View style={prototypeStyles.stageSectionHeader}>
        <Text style={prototypeStyles.stageSectionTitle}>{textByLanguage(language, 'Trạng thái yêu cầu', 'Request status')}</Text>
        <Text style={prototypeStyles.stageSectionAction}>{textByLanguage(language, 'Theo thời gian thực', 'Live')}</Text>
      </View>

      <View style={prototypeStyles.stageTimelineCard} testID="worker-v5-stage-seven-timeline">
        {timelineRows.map((row, index) => (
          <View key={row.title} style={prototypeStyles.stageTimelineItem}>
            <View style={prototypeStyles.stageTimelineMarkerColumn}>
              <View style={[prototypeStyles.stageTimelineMarker, row.state === 'done' && prototypeStyles.stageTimelineMarkerDone, row.state === 'active' && prototypeStyles.stageTimelineMarkerActive]}>
                <Text style={[prototypeStyles.stageTimelineMarkerText, row.state === 'done' && prototypeStyles.stageTimelineMarkerTextDone]}>{row.state === 'done' ? '✓' : index + 1}</Text>
              </View>
              {index < timelineRows.length - 1 ? <View style={prototypeStyles.stageTimelineConnector} /> : null}
            </View>
            <View style={prototypeStyles.stageTimelineCopy}>
              <Text style={prototypeStyles.stageTimelineTitle}>{row.title}</Text>
              <Text numberOfLines={2} style={prototypeStyles.stageTimelineMeta}>{row.meta}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={prototypeStyles.stageActionRow}>
        <WorkerJobsLegacyPrototypeStageActionButton
          label={textByLanguage(language, 'Nhắn khách', 'Message customer')}
          onPress={navigateJobChat}
          testID="worker-v5-stage-seven-message-action"
        />
        <WorkerJobsLegacyPrototypeStageActionButton
          label={approved ? textByLanguage(language, 'Tiếp tục', 'Continue') : textByLanguage(language, 'Chờ khách phê duyệt', 'Waiting for customer')}
          onPress={navigateNext}
          primary
          testID="worker-v5-stage-seven-primary-action"
        />
      </View>
    </View>
  )
}

export function WorkerJobsLegacyPrototypeStageEightBody({
  language,
  navigateNext,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateNext: () => void
  reduceTransparency: boolean
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const deal = runtime.state.deal
  const jobId = deal?.id ?? null
  const [completionNote, setCompletionNote] = useState(deal?.completionNotes ?? '')
  const [completionPhotos, setCompletionPhotos] = useState<LocalMediaUploadDraft[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [submitBusy, setSubmitBusy] = useState(false)
  const submitBusyRef = useRef(false)
  const uploadedDraftRef = useRef<{ fingerprint: string; jobId: string; mediaRefs: string[] } | null>(null)
  const completionPhotoUrls = Array.from(new Set([
    ...(deal?.completionPhotoUrls ?? []),
    ...completionPhotos.map((photo) => photo.uri),
  ]))
  const hasCompletionPhoto = completionPhotoUrls.length > 0
  const checks = [
    {
      done: hasCompletionPhoto,
      meta: hasCompletionPhoto ? textByLanguage(language, 'Đã thêm', 'Added') : textByLanguage(language, 'Cần ảnh', 'Needs photo'),
      title: textByLanguage(language, 'Có ảnh hoàn tất', 'Completion photo added'),
    },
    {
      done: Boolean(completionNote.trim() || deal?.completionNotes?.trim()),
      meta: completionNote.trim() || deal?.completionNotes?.trim() ? textByLanguage(language, 'Đã ghi', 'Added') : textByLanguage(language, 'Cần ghi chú', 'Needs note'),
      title: textByLanguage(language, 'Có ghi chú hoàn tất', 'Completion note added'),
    },
  ]
  const submitDisabled = submitBusy || !jobId || completionNote.trim().length < 5 || !hasCompletionPhoto

  const addCompletionPhoto = async () => {
    if (submitBusyRef.current || completionPhotos.length >= 10) return
    setNotice(null)
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        setNotice(textByLanguage(language, 'Cần quyền kho ảnh để thêm bằng chứng hoàn tất.', 'Photo-library access is needed to add completion evidence.'))
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.84,
      })
      if (result.canceled || result.assets.length === 0) return
      const asset = result.assets[0]
      const draft: LocalMediaUploadDraft = {
        fileName: workerV5PrivateKaelMediaName(asset, completionPhotos.length, language),
        fileSizeBytes: asset.fileSize ?? undefined,
        mimeType: asset.mimeType ?? undefined,
        type: 'image',
        uri: asset.uri,
      }
      setCompletionPhotos((current) => current.some((item) => item.uri === draft.uri) ? current : [...current, draft].slice(0, 10))
      uploadedDraftRef.current = null
    } catch {
      setNotice(textByLanguage(language, 'Chưa thể mở ảnh hoàn tất lúc này. Vui lòng thử lại.', 'Completion photos could not be opened. Please try again.'))
    }
  }

  const submitCompletion = async () => {
    const normalizedNote = completionNote.trim()
    if (submitBusyRef.current || !jobId || normalizedNote.length < 5 || !hasCompletionPhoto) return
    submitBusyRef.current = true
    setSubmitBusy(true)
    setNotice(null)
    try {
      const fingerprint = completionPhotos.map((photo) => `${photo.uri}:${photo.fileSizeBytes ?? ''}`).join('|')
      let uploadedRefs: string[] = []
      if (completionPhotos.length > 0) {
        const cachedUpload = uploadedDraftRef.current
        if (cachedUpload?.jobId === jobId && cachedUpload.fingerprint === fingerprint) {
          uploadedRefs = cachedUpload.mediaRefs
        } else {
          const uploaded = await uploadJobMediaDrafts(jobId, completionPhotos, 'after')
          if (!uploaded.success) {
            setNotice(localizeMediaUploadFailure(uploaded, language))
            return
          }
          uploadedRefs = uploaded.mediaRefs
          uploadedDraftRef.current = { fingerprint, jobId, mediaRefs: uploadedRefs }
        }
      }
      const updated = await runtime.actions.workerUpdateStatus('completed_by_worker', {
        completion_notes: normalizedNote,
        completion_photo_urls: Array.from(new Set([...(deal?.completionPhotoUrls ?? []), ...uploadedRefs])),
      })
      if (updated) {
        navigateNext()
        return
      }
      setNotice(runtime.state.lastError ?? textByLanguage(language, 'Chưa thể gửi hồ sơ hoàn tất. Vui lòng thử lại.', 'Completion evidence could not be submitted. Please try again.'))
    } catch {
      setNotice(textByLanguage(language, 'Chưa thể gửi hồ sơ hoàn tất. Vui lòng thử lại.', 'Completion evidence could not be submitted. Please try again.'))
    } finally {
      submitBusyRef.current = false
      setSubmitBusy(false)
    }
  }

  const customerEvidencePhotoUrls = deal?.customerEvidencePhotoUrls ?? []
  const fieldEvidencePhotoUrls = deal?.fieldEvidencePhotoUrls ?? []
  return (
    <View style={prototypeStyles.bodyStack} testID="worker-v5-stage-eight-prototype">
      <View style={[prototypeStyles.stageCompletionHero, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-stage-eight-hero">
        <View style={prototypeStyles.stageCompletionCopy}>
          <Text style={prototypeStyles.stageCompletionKicker}>{textByLanguage(language, 'Hoàn tất công việc', 'Complete the job')}</Text>
          <Text numberOfLines={2} style={prototypeStyles.stageCompletionTitle}>{hasCompletionPhoto || Boolean(completionNote.trim()) ? textByLanguage(language, 'Hồ sơ đang hoàn thiện', 'Completion record in progress') : textByLanguage(language, 'Chưa có hồ sơ hoàn tất', 'No completion record yet')}</Text>
          <Text numberOfLines={2} style={prototypeStyles.stageCompletionMeta}>{textByLanguage(language, 'Thêm ảnh và ghi chú ngắn trước khi gửi.', 'Add a photo and short note before sending.')}</Text>
        </View>
        <Image
          accessible={false}
          contentFit="contain"
          source={workerJobsLegacyPrototypeStageEightCompletionWorkart}
          style={prototypeStyles.stageCompletionWorkart}
          testID="worker-v5-stage-eight-workart"
        />
      </View>

      {customerEvidencePhotoUrls.length > 0 ? (
        <>
          <View style={prototypeStyles.stageSectionHeader}>
            <Text style={prototypeStyles.stageSectionTitle}>{textByLanguage(language, 'Ảnh từ khách', 'Customer photos')}</Text>
            <Text style={prototypeStyles.stageSectionAction}>{customerEvidencePhotoUrls.length} ảnh</Text>
          </View>
          <WorkerV5EvidenceTray emptyLabel={textByLanguage(language, 'Chưa có', 'None')} language={language} reduceTransparency={reduceTransparency} urls={customerEvidencePhotoUrls} />
        </>
      ) : null}
      {fieldEvidencePhotoUrls.length > 0 ? (
        <>
          <View style={prototypeStyles.stageSectionHeader}>
            <Text style={prototypeStyles.stageSectionTitle}>{textByLanguage(language, 'Ảnh hiện trường', 'On-site photos')}</Text>
            <Text style={prototypeStyles.stageSectionAction}>{fieldEvidencePhotoUrls.length} ảnh</Text>
          </View>
          <WorkerV5EvidenceTray emptyLabel={textByLanguage(language, 'Chưa có', 'None')} language={language} reduceTransparency={reduceTransparency} urls={fieldEvidencePhotoUrls} />
        </>
      ) : null}

      <View style={prototypeStyles.stageSectionHeader}>
        <Text style={prototypeStyles.stageSectionTitle}>{textByLanguage(language, 'Ảnh hoàn tất', 'Completion photos')}</Text>
        <Text style={prototypeStyles.stageSectionAction}>{completionPhotoUrls.length} ảnh</Text>
      </View>
      <View style={[prototypeStyles.stageCompletionPhotoCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-completion-after-gallery">
        {completionPhotoUrls.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {completionPhotoUrls.map((uri) => <Image key={uri} contentFit="cover" source={{ uri }} style={prototypeStyles.stageCompletionPhoto} />)}
          </View>
        ) : (
          <View style={prototypeStyles.stageCompletionPhotoEmpty}>
            <View style={prototypeStyles.stageCompletionPhotoEmptyIcon}>
              <WorkerJobsLegacyPrototypeMetaIcon kind="photo" size={20} />
            </View>
            <View style={prototypeStyles.stageCompletionPhotoCopy}>
              <Text style={prototypeStyles.stageCompletionPhotoTitle}>{textByLanguage(language, 'Chưa có ảnh hoàn tất', 'No completion photo')}</Text>
              <Text style={prototypeStyles.stageCompletionPhotoMeta}>{textByLanguage(language, 'Thêm một ảnh trước khi gửi.', 'Add one photo before sending.')}</Text>
            </View>
            <Pressable
              accessibilityLabel={textByLanguage(language, 'Thêm ảnh hoàn tất', 'Add completion photo')}
              accessibilityRole="button"
              accessibilityState={{ disabled: submitBusy }}
              disabled={submitBusy}
              onPress={() => void addCompletionPhoto()}
              style={({ pressed }) => [prototypeStyles.stageCompletionInlineAction, pressed && !submitBusy && { opacity: 0.84 }]}
              testID="worker-v5-completion-add-photo-action"
            >
              <Text style={prototypeStyles.stageCompletionInlineActionText}>{textByLanguage(language, 'Thêm ảnh', 'Add photo')}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={prototypeStyles.stageSectionHeader}>
        <Text style={prototypeStyles.stageSectionTitle}>{textByLanguage(language, 'Kiểm tra cuối', 'Final check')}</Text>
        <Text style={prototypeStyles.stageSectionAction}>{completionNote.trim() && hasCompletionPhoto ? textByLanguage(language, 'Sẵn sàng gửi', 'Ready to send') : textByLanguage(language, 'Cần bổ sung', 'Needs input')}</Text>
      </View>
      <View style={prototypeStyles.stageCompletionCheckCard}>
        {checks.map((check, index) => (
          <View key={check.title} style={[prototypeStyles.stageCompletionCheckRow, index === checks.length - 1 && prototypeStyles.stageCompletionCheckRowLast]}>
            <View style={[prototypeStyles.stageCompletionCheckIcon, check.done && prototypeStyles.stageCompletionCheckIconDone]}>
              <Text style={[prototypeStyles.stageCompletionCheckIconText, check.done && prototypeStyles.stageCompletionCheckIconTextDone]}>{check.done ? '✓' : index + 1}</Text>
            </View>
            <View style={prototypeStyles.stageCompletionCheckCopy}>
              <Text style={prototypeStyles.stageCompletionCheckTitle}>{check.title}</Text>
              <Text style={prototypeStyles.stageCompletionCheckMeta}>{check.done ? textByLanguage(language, 'Đã sẵn sàng', 'Ready') : textByLanguage(language, 'Cần bổ sung', 'Needs attention')}</Text>
            </View>
            <Text numberOfLines={2} style={prototypeStyles.stageCompletionCheckStatus}>{check.meta}</Text>
          </View>
        ))}
      </View>

      <KaelTextField
        editable={!submitBusy}
        inputShellStyle={prototypeStyles.stageCompletionNoteShell}
        label={textByLanguage(language, 'Ghi chú hoàn tất', 'Completion note')}
        maxLength={1000}
        multiline
        onChangeText={setCompletionNote}
        placeholder={textByLanguage(language, 'Mô tả ngắn việc đã làm.', 'Briefly describe the completed work.')}
        placeholderTextColor={color.text.muted}
        style={prototypeStyles.stageCompletionNoteInput}
        testID="worker-v5-completion-note-input"
        value={completionNote}
      />
      {notice ? <Text accessibilityLiveRegion="polite" style={prototypeStyles.stageSummaryMeta}>{notice}</Text> : null}
      <WorkerJobsLegacyPrototypeStageActionButton
        disabled={submitDisabled}
        label={submitBusy ? textByLanguage(language, 'Đang gửi hồ sơ', 'Submitting') : textByLanguage(language, 'Gửi hồ sơ hoàn tất', 'Send completion')}
        onPress={() => void submitCompletion()}
        primary
        testID="worker-v5-completion-submit-action"
      />
    </View>
  )
}
