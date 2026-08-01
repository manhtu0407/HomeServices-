import type { CaseWorkEvidence, LocalDeal, ServiceType } from '@nestscout/shared'
import { useRef } from 'react'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

import type { AppLanguage } from '@/lib/app-language'
import type { KaelStreamResponseDeltaEvent } from '@/lib/kael-stream'
import {
  cleanupKaelChatMediaRefs,
  localizeMediaUploadFailure,
  uploadJobMediaDrafts,
  uploadKaelChatMediaDrafts,
  type LocalMediaUploadDraft,
} from '@/lib/media-upload'
import { jobService, kaelChatService, kaelChatStreamService } from '@/lib/services'

import { clearPendingKaelChatDraft } from '../kael-chat/pending-intake'
import {
  localizeKaelRequestFailure,
  shouldUseLegacyKaelEvidenceFallback,
} from './customer-kael-chat-helpers'
import {
  mediaDraftTypeFromPickerAsset,
  mergeMediaDrafts,
} from './customer-media-draft-helpers'
import { initialAgenticEvidencePayload } from './customer-kael-evidence-payload'
import type { CustomerKaelRequestGuard } from './customer-kael-state-scope'
import type { CustomerKaelMode } from './types'
import type { useCustomerKaelCaseUiState } from './use-customer-kael-case-ui-state'
import type { useCustomerKaelChatUiState } from './use-customer-kael-chat-ui-state'
import type { useCustomerKaelConversationState } from './use-customer-kael-conversation-state'
import type { useKaelProcessLineController } from './use-kael-process-line-controller'

type CaseUi = ReturnType<typeof useCustomerKaelCaseUiState>
type ChatUi = ReturnType<typeof useCustomerKaelChatUiState>
type Conversation = ReturnType<typeof useCustomerKaelConversationState>
type ProcessController = ReturnType<typeof useKaelProcessLineController>

const chatComposerMediaTypes: ImagePicker.MediaType[] = ['images', 'videos']

export function useCustomerKaelEvidenceActions({
  agenticEvidenceGateActive,
  caseEvidenceGateActive,
  caseUi,
  chatUi,
  conversation,
  deal,
  hydrateRemoteJobById,
  kaelRequestGuard,
  language,
  mode,
  pendingDraftLocalizedMessage,
  pendingDraftOwnerId,
  processController,
  selectedService,
}: {
  agenticEvidenceGateActive: boolean
  caseEvidenceGateActive: boolean
  caseUi: CaseUi
  chatUi: ChatUi
  conversation: Conversation
  deal: LocalDeal | null
  hydrateRemoteJobById?: (jobId: string) => Promise<unknown>
  kaelRequestGuard: CustomerKaelRequestGuard
  language: AppLanguage
  mode: CustomerKaelMode
  pendingDraftLocalizedMessage: string | null
  pendingDraftOwnerId: string | null
  processController: ProcessController
  selectedService: ServiceType | null
}) {
  const {
    chat,
    composerMediaDrafts,
    pendingDraft,
    setChat,
    setComposerMediaDrafts,
    setError,
    setLoading,
    setRouteDraftEvidencePending,
    setStreamingReply,
    setTurns,
    turns,
  } = conversation
  const {
    agenticEvidenceReason,
    setAgenticEvidenceReason,
    setAgenticEvidenceRejectOpen,
    setSubmittingAgenticEvidence,
    setUploadingMedia,
    setVoiceTranscript,
    submittingAgenticEvidence,
    uploadingMedia,
    voiceTranscript,
  } = chatUi
  const {
    clearCaseEvidenceDraft,
    setSubmittingCaseEvidence,
    submittingCaseEvidence,
  } = caseUi
  const {
    settleEvidenceProcessLines,
    startEvidenceProcessLines,
    startProcessLines,
    stopProcessLines,
    updateEvidenceProcessProgress,
  } = processController
  const evidenceSubmissionRef = useRef<{ ownerKey: string } | null>(null)

  const pickComposerMedia = async () => {
    if (mode !== 'normal' && mode !== 'case') return
    const requestToken = kaelRequestGuard.begin('media-picker')
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (!permission.granted) {
        Alert.alert(
          language === 'vi' ? 'Cần quyền ảnh/video' : 'Media permission needed',
          language === 'vi'
            ? 'Cho phép NestScout chọn ảnh hoặc video để gửi cho Kael.'
            : 'Allow NestScout to pick photos or videos for Kael.',
        )
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: chatComposerMediaTypes,
        preferredAssetRepresentationMode: 'compatible' as ImagePicker.UIImagePickerPreferredAssetRepresentationMode,
        quality: 0.86,
        selectionLimit: Math.max(1, 5 - composerMediaDrafts.length),
      })
      if (result.canceled || !kaelRequestGuard.isCurrent(requestToken)) return
      const drafts: LocalMediaUploadDraft[] = result.assets.map((asset) => ({
        uri: asset.uri,
        type: mediaDraftTypeFromPickerAsset(asset),
        fileName: asset.fileName ?? asset.uri.split('/').pop(),
        mimeType: asset.mimeType ?? undefined,
        fileSizeBytes: asset.fileSize ?? undefined,
        durationMillis: asset.duration ?? undefined,
      }))
      setComposerMediaDrafts((current) => mergeMediaDrafts(current, drafts, 5))
      setError(null)
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setError(language === 'vi'
          ? 'Chưa thể mở thư viện ảnh/video lúc này. Vui lòng thử lại.'
          : 'Could not open the media library right now. Please try again.')
      }
    }
  }

  const submitAgenticEvidence = async (decision: 'confirmed' | 'skipped') => {
    const chatSession = chat?.session
    if (!chatSession?.id || submittingAgenticEvidence) return
    const sessionId = chatSession.id
    const reviewedVoiceTranscript = voiceTranscript.trim()
    const skipReason = agenticEvidenceReason.trim()
    if (decision === 'skipped' && !skipReason) {
      setError(language === 'vi'
        ? 'Nhập lý do ngắn trước khi tiếp tục không có bằng chứng.'
        : 'Add a short reason before continuing without evidence.')
      return
    }
    if (decision === 'confirmed' && composerMediaDrafts.length === 0 && !reviewedVoiceTranscript) {
      setError(language === 'vi'
        ? 'Thêm ảnh, video hoặc bản chép lời trước khi xác nhận.'
        : 'Add media or an editable transcript before confirming.')
      return
    }
    const firstCustomerMessage = turns.find((turn) => turn.role === 'customer' && turn.text_content)?.text_content ?? null
    const sourceMessage = pendingDraftLocalizedMessage || firstCustomerMessage || (language === 'vi'
      ? 'Khách đã gửi ngữ cảnh dịch vụ.'
      : 'Customer sent service context.')
    const initialEvidence = initialAgenticEvidencePayload(
      decision,
      reviewedVoiceTranscript,
      sourceMessage,
    )
    const operation = { ownerKey: sessionId }
    if (evidenceSubmissionRef.current?.ownerKey === operation.ownerKey) return
    evidenceSubmissionRef.current = operation
    const requestToken = kaelRequestGuard.begin('conversation')
    setSubmittingAgenticEvidence(true)
    setLoading(true)
    setError(null)
    setStreamingReply(null)
    let photoUrls: string[] = []
    let uploadedMediaRefs: string[] = []
    let mediaAccepted = false
    let evidenceItems: CaseWorkEvidence[] = initialEvidence.evidenceItems
    try {
      startEvidenceProcessLines({
        hasImage: composerMediaDrafts.some((item) => item.type === 'image'),
        hasVideo: composerMediaDrafts.some((item) => item.type === 'video'),
        hasVoiceTranscript: Boolean(reviewedVoiceTranscript),
        serviceType: selectedService ?? chatSession.service_type,
      })
      if (decision === 'confirmed') {
        setUploadingMedia(true)
        const uploaded = await uploadKaelChatMediaDrafts(composerMediaDrafts)
        if (kaelRequestGuard.isCurrent(requestToken)) setUploadingMedia(false)
        if (!uploaded.success) {
          if (kaelRequestGuard.isCurrent(requestToken)) {
            stopProcessLines()
            setError(localizeMediaUploadFailure(uploaded, language))
          }
          return
        }
        photoUrls = uploaded.urls
        uploadedMediaRefs = uploaded.mediaRefs
        evidenceItems = [...evidenceItems, ...uploaded.evidenceItems]
        if (!kaelRequestGuard.isCurrent(requestToken)) return
      }
      const processPrompt = decision === 'confirmed'
        ? (language === 'vi' ? 'Đã gửi bằng chứng hiện trạng.' : 'Sent current evidence.')
        : (language === 'vi' ? 'Tiếp tục không có bằng chứng.' : 'Continue without evidence.')
      const evidenceInput = {
        decision,
        evidence_items: evidenceItems,
        language,
        message: initialEvidence.message,
        photo_urls: photoUrls,
        media_refs: [],
        problem_chips: pendingDraft?.problemChips ?? [],
        skip_reason: decision === 'skipped' ? skipReason : undefined,
      }
      const appendStreamingReply = (event: KaelStreamResponseDeltaEvent) => {
        if (!kaelRequestGuard.isCurrent(requestToken)) return
        setStreamingReply((current) => {
          const text = current?.turnId === event.turnId
            ? `${current.text}${event.delta}`
            : event.delta
          return {
            text: text.slice(0, 12_000),
            turnId: event.turnId,
          }
        })
      }
      let result = await kaelChatStreamService.submitEvidence(sessionId, evidenceInput, {
        onResponseDelta: appendStreamingReply,
        onStage: ({ progress }) => {
          if (kaelRequestGuard.isCurrent(requestToken)) updateEvidenceProcessProgress(progress)
        },
      })
      if (shouldFallbackToDirectEvidenceSubmission(result)) {
        result = await kaelChatService.submitEvidence(sessionId, evidenceInput)
      }
      if (result.success) {
        mediaAccepted = true
        if (!kaelRequestGuard.isCurrent(requestToken)) return
        await settleEvidenceProcessLines()
        if (!kaelRequestGuard.isCurrent(requestToken)) return
        if (pendingDraftOwnerId) await clearPendingKaelChatDraft(pendingDraftOwnerId)
        if (!kaelRequestGuard.isCurrent(requestToken)) return
        setRouteDraftEvidencePending(false)
        setChat(result.data)
        setTurns(result.data.turns)
        setStreamingReply(null)
        stopProcessLines()
        setComposerMediaDrafts([])
        setVoiceTranscript('')
        setAgenticEvidenceRejectOpen(false)
        setAgenticEvidenceReason('')
      } else if (
        kaelRequestGuard.isCurrent(requestToken) &&
        shouldUseLegacyKaelEvidenceFallback(result, photoUrls)
      ) {
        const legacy = await kaelChatService.sendTurn(sessionId, {
          address_district: pendingDraft?.districtLabel ?? undefined,
          address_label: pendingDraft?.addressLabel,
          evidence_items: evidenceItems,
          language,
          message: processPrompt,
          photo_urls: photoUrls,
          problem_chips: pendingDraft?.problemChips ?? [],
        })
        if (legacy.success) {
          mediaAccepted = true
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          await settleEvidenceProcessLines()
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          if (pendingDraftOwnerId) await clearPendingKaelChatDraft(pendingDraftOwnerId)
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          setRouteDraftEvidencePending(false)
          setChat(legacy.data)
          setTurns(legacy.data.turns)
          setStreamingReply(null)
          stopProcessLines()
          setComposerMediaDrafts([])
          setVoiceTranscript('')
          setAgenticEvidenceRejectOpen(false)
          setAgenticEvidenceReason('')
        } else if (kaelRequestGuard.isCurrent(requestToken)) {
          stopProcessLines()
          setError(localizeKaelRequestFailure(legacy, language))
        }
      } else if (kaelRequestGuard.isCurrent(requestToken)) {
        stopProcessLines()
        setError(localizeKaelRequestFailure(result, language))
      }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setStreamingReply(null)
        stopProcessLines()
        setError(language === 'vi'
          ? 'Chưa thể gửi bằng chứng lúc này. Vui lòng thử lại.'
          : 'Could not submit evidence right now. Please try again.')
      }
    } finally {
      if (!mediaAccepted && uploadedMediaRefs.length > 0) {
        try {
          await cleanupKaelChatMediaRefs(uploadedMediaRefs)
        } catch {
          // Cleanup is best-effort; the server-side retention queue remains authoritative.
        }
      }
      if (evidenceSubmissionRef.current === operation) evidenceSubmissionRef.current = null
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setUploadingMedia(false)
        setSubmittingAgenticEvidence(false)
        setLoading(false)
      }
    }
  }

  const submitCaseEvidence = async (decision: 'confirmed' | 'skipped') => {
    if (!deal?.id || submittingCaseEvidence) return
    const reviewedVoiceTranscript = voiceTranscript.trim()
    if (decision === 'confirmed' && composerMediaDrafts.length === 0 && !reviewedVoiceTranscript) {
      setError(language === 'vi'
        ? 'Thêm ảnh, video hoặc bản chép lời trước khi xác nhận.'
        : 'Add media or an editable transcript before confirming.')
      return
    }
    const operation = { ownerKey: deal.id }
    if (evidenceSubmissionRef.current?.ownerKey === operation.ownerKey) return
    evidenceSubmissionRef.current = operation
    const requestToken = kaelRequestGuard.begin('conversation')
    setSubmittingCaseEvidence(true)
    setLoading(true)
    setError(null)
    const prompt = decision === 'confirmed'
      ? (language === 'vi' ? 'Đã gửi hiện trạng cho công việc.' : 'Sent current evidence for this job.')
      : (language === 'vi' ? 'Tiếp tục không có bằng chứng hiện trạng.' : 'Continue without current evidence.')
    try {
      const processDone = startProcessLines(prompt, {
        complexity: deal.estimate?.complexity ?? null,
        mediaCount: decision === 'confirmed' ? composerMediaDrafts.length : 0,
        mode: 'case',
        serviceType: deal.draft.serviceType,
      })
      if (decision === 'confirmed' && composerMediaDrafts.length > 0) {
        setUploadingMedia(true)
        const uploaded = await uploadJobMediaDrafts(deal.id, composerMediaDrafts, 'before')
        if (kaelRequestGuard.isCurrent(requestToken)) setUploadingMedia(false)
        if (!uploaded.success) {
          if (kaelRequestGuard.isCurrent(requestToken)) {
            stopProcessLines()
            setError(localizeMediaUploadFailure(uploaded, language))
          }
          return
        }
        if (!kaelRequestGuard.isCurrent(requestToken)) return
      }
      if (decision === 'confirmed' && reviewedVoiceTranscript) {
        const storedTranscript = await jobService.sendMessage(deal.id, { content: reviewedVoiceTranscript })
        if (!kaelRequestGuard.isCurrent(requestToken)) return
        if (!storedTranscript.success) {
          stopProcessLines()
          setError(localizeKaelRequestFailure(storedTranscript, language))
          return
        }
      }
      if (hydrateRemoteJobById) {
        await hydrateRemoteJobById(deal.id)
        if (!kaelRequestGuard.isCurrent(requestToken)) return
      }
      await processDone
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      clearCaseEvidenceDraft()
      setComposerMediaDrafts([])
      setVoiceTranscript('')
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setError(language === 'vi'
          ? 'Chưa thể gửi bằng chứng lúc này. Vui lòng thử lại.'
          : 'Could not submit evidence right now. Please try again.')
      }
    } finally {
      if (evidenceSubmissionRef.current === operation) evidenceSubmissionRef.current = null
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setUploadingMedia(false)
        setSubmittingCaseEvidence(false)
        setLoading(false)
        stopProcessLines()
      }
    }
  }

  return {
    pickComposerMedia,
    submitAgenticEvidence,
    submitCaseEvidence,
    uploadingMedia,
  }
}

function shouldFallbackToDirectEvidenceSubmission(result: { code?: string; status?: number }) {
  return result.code === 'STREAM_UNSUPPORTED' ||
    result.code === 'HTTP_404' ||
    result.code === 'HTTP_405' ||
    result.status === 404 ||
    result.status === 405
}
