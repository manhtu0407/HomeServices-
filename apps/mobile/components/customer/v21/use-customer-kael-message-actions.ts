import type { CaseWorkEvidence, LocalDeal, ServiceType } from '@nestscout/shared'
import { inferLocalDealDraftFromKael } from '@nestscout/shared'
import { useRef, type MutableRefObject } from 'react'

import type { AppLanguage } from '@/lib/app-language'
import {
  clearStableClientRequestId,
  shouldRetainClientRequestId,
  stableClientRequestId,
  type PendingClientRequestRef,
} from '@/lib/client-request-id'
import {
  cleanupKaelChatMediaRefs,
  localizeMediaUploadFailure,
  uploadKaelChatMediaDrafts,
} from '@/lib/media-upload'
import { jobService, kaelAssistantService, kaelChatService } from '@/lib/services'
import type { useJobChatThread } from '@/lib/use-job-chat-thread'

import {
  formatAssistantAnswer,
  isLikelyKaelIntakeRequest,
  localizeKaelRequestFailure,
  makeAssistantTurnId,
  shouldFallbackCaseAssistantToJobChat,
} from './customer-kael-chat-helpers'
import type { CustomerKaelRequestGuard } from './customer-kael-state-scope'
import type { CustomerKaelMode } from './types'
import type { useCustomerKaelChatUiState } from './use-customer-kael-chat-ui-state'
import type { useCustomerKaelConversationState } from './use-customer-kael-conversation-state'
import type { useCustomerKaelConversations } from './use-customer-kael-conversations'
import type { useKaelProcessLineController } from './use-kael-process-line-controller'

type ChatUi = ReturnType<typeof useCustomerKaelChatUiState>
type Conversation = ReturnType<typeof useCustomerKaelConversationState>
type Conversations = ReturnType<typeof useCustomerKaelConversations>
type JobIncidentThread = ReturnType<typeof useJobChatThread>
type ProcessController = ReturnType<typeof useKaelProcessLineController>

type PendingCustomerKaelCreate = {
  fingerprint: string
  ownerKey: string
  requestRef: PendingClientRequestRef
  upload: {
    evidenceItems: CaseWorkEvidence[]
    mediaRefs: string[]
    photoUrls: string[]
  } | null
}

export function useCustomerKaelMessageActions({
  chatUi,
  conversation,
  conversations,
  deal,
  hasSharedJobIncident,
  jobIncidentThread,
  kaelRequestGuard,
  language,
  mode,
  processController,
  requestOwnerKey,
  selectedService,
  selectedServiceRef,
}: {
  chatUi: ChatUi
  conversation: Conversation
  conversations?: Conversations
  deal: LocalDeal | null
  hasSharedJobIncident: boolean
  jobIncidentThread: JobIncidentThread
  kaelRequestGuard: CustomerKaelRequestGuard
  language: AppLanguage
  mode: CustomerKaelMode
  processController: ProcessController
  requestOwnerKey: string
  selectedService: ServiceType | null
  selectedServiceRef: MutableRefObject<ServiceType | null>
}) {
  const pendingCreateRef = useRef<PendingCustomerKaelCreate | null>(null)
  const sendOperationRef = useRef<{ ownerKey: string } | null>(null)
  const {
    chat,
    composerMediaDrafts,
    pendingDraft,
    setAssistantTurns,
    setChat,
    setComposerMediaDrafts,
    setError,
    setLoading,
    setTurns,
  } = conversation
  const {
    draft,
    setAgenticRejectOpen,
    setAgenticRejectReason,
    setDraft,
    setUploadingMedia,
    setVoiceTranscript,
    voiceTranscript,
  } = chatUi
  const { startProcessLines, stopProcessLines } = processController

  const sendMessage = async () => {
    const reviewedVoiceTranscript = voiceTranscript.trim()
    const message = draft.trim() || reviewedVoiceTranscript
    const hasComposerMedia = composerMediaDrafts.length > 0
    if (!message && !hasComposerMedia && !reviewedVoiceTranscript) return
    if (sendOperationRef.current?.ownerKey === requestOwnerKey) return
    const sendOperation = { ownerKey: requestOwnerKey }
    sendOperationRef.current = sendOperation
    const requestToken = kaelRequestGuard.begin('conversation')

    try {
      if (mode === 'normal' && conversations) {
        if (hasComposerMedia) {
          setError(language === 'vi'
            ? 'Ảnh và video được xử lý trong mục Xử lý công việc.'
            : 'Photos and videos are handled in Work handling.')
          return
        }
        const processDone = startProcessLines(message, {
          complexity: null,
          mediaCount: 0,
          mode: 'normal',
          serviceType: null,
        })
        setLoading(true)
        setError(null)
        try {
          const result = await conversations.sendConversationTurn(message)
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          if (result) {
            await processDone
            if (!kaelRequestGuard.isCurrent(requestToken)) return
            setDraft('')
            setVoiceTranscript('')
          } else {
            setError(conversations.sessionsError ?? (language === 'vi'
              ? 'Kael chưa thể trả lời lúc này.'
              : 'Kael could not reply right now.'))
          }
        } finally {
          if (kaelRequestGuard.isCurrent(requestToken)) {
            setLoading(false)
            stopProcessLines()
          }
        }
        return
      }

      if (mode === 'case' && deal) {
      if (hasComposerMedia) {
        setError(language === 'vi' ? 'Ảnh/video cần gửi qua công việc thật.' : 'Media requires a real job.')
        return
      }
      if (!deal.id) {
        setError(language === 'vi' ? 'Chưa có' : 'Empty')
        return
      }
      if (hasSharedJobIncident) {
        setLoading(true)
        setError(null)
        const sent = await jobIncidentThread.send(message)
        if (!kaelRequestGuard.isCurrent(requestToken)) return
        setLoading(false)
        if (sent) {
          setDraft('')
          setVoiceTranscript('')
        } else {
          setError(jobIncidentThread.error ?? (language === 'vi'
            ? 'Chưa thể gửi vào Kael Công việc.'
            : 'Kael Work could not send this message.'))
        }
        return
      }
      if (conversations) {
        const processDone = startProcessLines(message, {
          complexity: deal.estimate?.complexity ?? null,
          mediaCount: deal.draft.mediaCount ?? 0,
          mode: 'case',
          serviceType: deal.draft.serviceType,
        })
        setLoading(true)
        setError(null)
        try {
          const result = await conversations.sendConversationTurn(message)
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          if (result) {
            await processDone
            if (!kaelRequestGuard.isCurrent(requestToken)) return
            setDraft('')
          } else {
            setError(conversations.sessionsError ?? (language === 'vi'
              ? 'Kael chưa thể trả lời lúc này.'
              : 'Kael could not reply right now.'))
          }
        } finally {
          if (kaelRequestGuard.isCurrent(requestToken)) {
            setLoading(false)
            stopProcessLines()
          }
        }
        return
      }
      const processDone = startProcessLines(message, {
        complexity: deal.estimate?.complexity ?? null,
        mediaCount: deal.draft.mediaCount ?? 0,
        mode: 'case',
        serviceType: deal.draft.serviceType,
      })
      setLoading(true)
      setError(null)
      try {
        const result = await kaelAssistantService.ask({
          job_id: deal.id,
          language,
          message,
          surface: 'customer_case',
        })
        if (!kaelRequestGuard.isCurrent(requestToken)) return
        if (result.success) {
          await processDone
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          setAssistantTurns((current) => [
            ...current,
            {
              id: makeAssistantTurnId('customer_case', 'customer'),
              role: 'customer',
              surface: 'customer_case',
              text_content: message,
            },
            {
              id: makeAssistantTurnId('customer_case', 'kael'),
              role: 'kael',
              surface: 'customer_case',
              text_content: formatAssistantAnswer(result.data, language),
            },
          ])
          setDraft('')
        } else if (shouldFallbackCaseAssistantToJobChat(result)) {
          const stored = await jobService.sendMessage(deal.id, { content: message })
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          if (stored.success) {
            await processDone
            if (!kaelRequestGuard.isCurrent(requestToken)) return
            setAssistantTurns((current) => [
              ...current,
              {
                id: makeAssistantTurnId('customer_case', 'customer'),
                role: 'customer',
                surface: 'customer_case',
                text_content: message,
              },
            ])
            setDraft('')
          } else {
            setError(localizeKaelRequestFailure(stored, language))
          }
        } else {
          setError(localizeKaelRequestFailure(result, language))
        }
      } finally {
        if (kaelRequestGuard.isCurrent(requestToken)) {
          setLoading(false)
          stopProcessLines()
        }
      }
        return
      }

    const intakeIntent = isLikelyKaelIntakeRequest(message)
    const inferredDraft = selectedService ? null : inferLocalDealDraftFromKael(message)
    const shouldUseIntake = Boolean(
      hasComposerMedia || reviewedVoiceTranscript || pendingDraft || chat || intakeIntent,
    )
    if (!shouldUseIntake) {
      setLoading(true)
      setError(null)
      const processDone = startProcessLines(message, {
        complexity: null,
        mediaCount: 0,
        mode: conversations ? 'case' : 'normal',
        serviceType: null,
      })
      try {
        const catalogResult = conversations
          ? await conversations.sendConversationTurn(message)
          : null
        const result = conversations
          ? null
          : await kaelAssistantService.ask({
              language,
              message,
              surface: 'customer_normal',
            })
        if (!kaelRequestGuard.isCurrent(requestToken)) return
        if (catalogResult) {
          await processDone
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          setDraft('')
        } else if (result?.success) {
          await processDone
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          setAssistantTurns((current) => [
            ...current,
            {
              id: makeAssistantTurnId('customer_normal', 'customer'),
              role: 'customer',
              surface: 'customer_normal',
              text_content: message,
            },
            {
              id: makeAssistantTurnId('customer_normal', 'kael'),
              role: 'kael',
              surface: 'customer_normal',
              text_content: formatAssistantAnswer(result.data, language),
            },
          ])
          setDraft('')
        } else if (result) {
          setError(localizeKaelRequestFailure(result, language))
        } else {
          setError(conversations?.sessionsError ?? (language === 'vi'
            ? 'Kael chưa thể tiếp nhận nội dung này.'
            : 'Kael could not receive this message.'))
        }
      } finally {
        if (kaelRequestGuard.isCurrent(requestToken)) {
          setLoading(false)
          stopProcessLines()
        }
      }
      return
    }

    const inferredService = selectedService ?? inferredDraft?.serviceType ?? null
    if (!inferredService) {
      setError(language === 'vi'
        ? 'Kael cần biết dịch vụ trước khi tạo yêu cầu.'
        : 'Kael needs a service before creating a request.')
      return
    }
    if (!selectedService && inferredDraft?.serviceType) {
      selectedServiceRef.current = inferredDraft.serviceType
    }
    const catalogConversation = conversations
      ? chat
        ? await conversations.syncLinkedCaseSession(chat.session.id) ?? await conversations.ensureActiveSession()
        : await conversations.ensureActiveSession()
      : null
    if (conversations && !catalogConversation) {
      setError(language === 'vi'
        ? 'Chưa thể mở phiên Xử lý công việc.'
        : 'A Work handling session could not be opened.')
      return
    }
    setLoading(true)
    setError(null)
    const outgoingMessage = message || (language === 'vi' ? 'Đã gửi ảnh/video.' : 'Sent media.')
    const createFingerprint = JSON.stringify({
      evidence: {
        media: composerMediaDrafts.map((item) => ({
          durationMillis: item.durationMillis,
          fileName: item.fileName,
          fileSizeBytes: item.fileSizeBytes,
          mimeType: item.mimeType,
          type: item.type,
          uri: item.uri,
        })),
        voiceTranscript: reviewedVoiceTranscript,
      },
      language,
      message: outgoingMessage,
      catalog_client_request_id: catalogConversation?.session.client_request_id ?? null,
      problem_chips: inferredDraft?.problemChips ?? [],
      service_type: inferredService,
    })
    let pendingCreate = !chat ? pendingCreateRef.current : null
    if (
      !chat &&
      (!pendingCreate || pendingCreate.ownerKey !== requestOwnerKey || pendingCreate.fingerprint !== createFingerprint)
    ) {
      pendingCreate = {
        fingerprint: createFingerprint,
        ownerKey: requestOwnerKey,
        requestRef: {
          current: catalogConversation
            ? {
                fingerprint: createFingerprint,
                id: catalogConversation.session.client_request_id,
              }
            : null,
        },
        upload: null,
      }
      pendingCreateRef.current = pendingCreate
    }

    let photoUrls: string[] = pendingCreate?.upload?.photoUrls ?? []
    let uploadedMediaRefs: string[] = []
    let evidenceItems: CaseWorkEvidence[] = pendingCreate?.upload?.evidenceItems ?? (reviewedVoiceTranscript
      ? [{ kind: 'voice_transcript', transcript: reviewedVoiceTranscript, model_eligible: true }]
      : [])
    if (pendingCreate?.upload) {
      uploadedMediaRefs = pendingCreate.upload.mediaRefs
    } else if (hasComposerMedia) {
      setUploadingMedia(true)
      const uploaded = await uploadKaelChatMediaDrafts(composerMediaDrafts)
      if (!kaelRequestGuard.isCurrent(requestToken)) {
        if (uploaded.success) await cleanupKaelChatMediaRefs(uploaded.mediaRefs)
        return
      }
      setUploadingMedia(false)
      if (!uploaded.success) {
        setLoading(false)
        stopProcessLines()
        setError(localizeMediaUploadFailure(uploaded, language))
        return
      }
      photoUrls = uploaded.urls
      uploadedMediaRefs = uploaded.mediaRefs
      evidenceItems = [...evidenceItems, ...uploaded.evidenceItems]
      if (pendingCreate) {
        pendingCreate.upload = {
          evidenceItems,
          mediaRefs: uploadedMediaRefs,
          photoUrls,
        }
      }
    }
    const processDone = startProcessLines(outgoingMessage, {
      complexity: null,
      mediaCount: composerMediaDrafts.length + (reviewedVoiceTranscript ? 1 : 0),
      mode: conversations ? 'case' : 'normal',
      serviceType: inferredService,
    })
    const result = chat
      ? await kaelChatService.sendTurn(chat.session.id, {
          evidence_items: evidenceItems,
          language,
          message: outgoingMessage,
          photo_urls: photoUrls,
        })
      : await kaelChatService.create({
          client_request_id: stableClientRequestId(
            pendingCreate?.requestRef ?? { current: null },
            createFingerprint,
          ),
          evidence_items: evidenceItems,
          language,
          message: outgoingMessage,
          photo_urls: photoUrls,
          problem_chips: inferredDraft?.problemChips ?? [],
          service_type: inferredService,
        })
      if (result.success) {
      if (!chat && pendingCreate) {
        clearStableClientRequestId(pendingCreate.requestRef, createFingerprint)
        if (pendingCreateRef.current === pendingCreate) pendingCreateRef.current = null
      }
      await processDone
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      setLoading(false)
      stopProcessLines()
      setChat(result.data)
      setTurns(result.data.turns)
      setDraft('')
      setVoiceTranscript('')
      setComposerMediaDrafts([])
      setAgenticRejectOpen(false)
      setAgenticRejectReason('')
      if (conversations) await conversations.syncLinkedCaseSession(result.data.session.id)
      } else {
      const retainPendingCreate = Boolean(
        !chat && pendingCreate && shouldRetainClientRequestId(result),
      )
      if (!retainPendingCreate) {
        await cleanupKaelChatMediaRefs(uploadedMediaRefs)
        if (!chat && pendingCreate) {
          clearStableClientRequestId(pendingCreate.requestRef, createFingerprint)
          if (pendingCreateRef.current === pendingCreate) pendingCreateRef.current = null
        }
      }
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      setLoading(false)
      stopProcessLines()
        setError(localizeKaelRequestFailure(result, language))
      }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setLoading(false)
        setUploadingMedia(false)
        stopProcessLines()
        setError(language === 'vi'
          ? 'Kael đang không kết nối được. Vui lòng thử lại.'
          : 'Kael is unavailable. Try again.')
      }
    } finally {
      if (sendOperationRef.current === sendOperation) sendOperationRef.current = null
    }
  }

  return { sendMessage }
}
