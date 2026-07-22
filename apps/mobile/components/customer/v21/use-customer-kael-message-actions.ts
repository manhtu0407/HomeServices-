import type { CaseWorkEvidence, LocalDeal, ServiceType } from '@nestscout/shared'
import { inferLocalDealDraftFromKael } from '@nestscout/shared'
import { useRef, type MutableRefObject } from 'react'

import type { AppLanguage } from '@/lib/app-language'
import type { ApiResult } from '@/lib/api'
import type { KaelChatResponse } from '@/lib/api-types'
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
import {
  jobService,
  kaelAssistantService,
  kaelChatService,
  kaelChatStreamService,
} from '@/lib/services'
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

const RECONCILABLE_KAEL_STREAM_FAILURES = new Set([
  'STREAM_BODY_UNREADABLE',
  'STREAM_ENDED',
  'STREAM_INVALID_ENCODING',
  'STREAM_NETWORK',
  'STREAM_RESPONSE_TOO_LARGE',
  'STREAM_RESULT_INVALID',
  'STREAM_TIMEOUT',
])

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
    let composerCleared = false
    const clearSubmittedComposer = () => {
      setDraft('')
      setVoiceTranscript('')
      composerCleared = true
    }
    const commitSubmittedComposer = () => {
      composerCleared = false
    }
    const restoreSubmittedComposer = () => {
      if (!composerCleared) return
      setDraft(draft)
      setVoiceTranscript(voiceTranscript)
      composerCleared = false
    }

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
          replyReveal: 'composer_message',
          serviceType: null,
        })
        clearSubmittedComposer()
        setLoading(true)
        setError(null)
        try {
          const result = await conversations.sendConversationTurn(message, { revealAfter: processDone })
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          if (result) {
            commitSubmittedComposer()
          } else {
            restoreSubmittedComposer()
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

        const activeAgenticChat = chat && !['confirmed', 'abandoned', 'unsupported'].includes(chat.session.status)
          ? chat
          : null
        if (activeAgenticChat) {
          const processDone = startProcessLines(message, {
            complexity: deal.estimate?.complexity ?? null,
            mediaCount: deal.draft.mediaCount ?? 0,
            mode: 'case',
            replyReveal: 'composer_message',
            serviceType: deal.draft.serviceType,
          })
          clearSubmittedComposer()
          setLoading(true)
          setError(null)
          try {
            const streamed = await kaelChatStreamService.sendTurn(activeAgenticChat.session.id, {
              language,
              message,
              photo_urls: [],
            })
            const result = await reconcileCommittedKaelTurn(activeAgenticChat, streamed)
            if (!kaelRequestGuard.isCurrent(requestToken)) return
            if (result.success) {
              await processDone
              if (!kaelRequestGuard.isCurrent(requestToken)) return
              setChat(result.data)
              setTurns(result.data.turns)
              commitSubmittedComposer()
              if (conversations) void conversations.syncLinkedCaseSession(result.data.session.id)
            } else {
              restoreSubmittedComposer()
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

        if (!deal.id) {
          setError(language === 'vi' ? 'Chưa có' : 'Empty')
          return
        }
        if (hasSharedJobIncident) {
          clearSubmittedComposer()
          setLoading(true)
          setError(null)
          const sent = await jobIncidentThread.send(message)
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          setLoading(false)
          if (sent) {
            commitSubmittedComposer()
          } else {
            restoreSubmittedComposer()
            setError(jobIncidentThread.error ?? (language === 'vi'
              ? 'Chưa thể gửi vào Kael Công việc.'
              : 'Kael Work could not send this message.'))
          }
          return
        }

        const processDone = startProcessLines(message, {
          complexity: deal.estimate?.complexity ?? null,
          mediaCount: deal.draft.mediaCount ?? 0,
          mode: 'case',
          replyReveal: 'composer_message',
          serviceType: deal.draft.serviceType,
        })
        clearSubmittedComposer()
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
            commitSubmittedComposer()
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
              commitSubmittedComposer()
            } else {
              restoreSubmittedComposer()
              setError(localizeKaelRequestFailure(stored, language))
            }
          } else {
            restoreSubmittedComposer()
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
        replyReveal: 'composer_message',
        serviceType: null,
      })
      clearSubmittedComposer()
      try {
        const catalogResult = conversations
          ? await conversations.sendConversationTurn(message, { revealAfter: processDone })
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
          commitSubmittedComposer()
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
          commitSubmittedComposer()
        } else if (result) {
          restoreSubmittedComposer()
          setError(localizeKaelRequestFailure(result, language))
        } else {
          restoreSubmittedComposer()
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
        ? conversations.activeResponse
        : await conversations.ensureActiveSession()
      : null
    if (conversations && !chat && !catalogConversation) {
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
      replyReveal: 'composer_message',
      serviceType: inferredService,
    })
    clearSubmittedComposer()
    const result = chat
      ? await kaelChatStreamService.sendTurn(chat.session.id, {
          evidence_items: evidenceItems,
          language,
          message: outgoingMessage,
          photo_urls: photoUrls,
        }).then((streamed) => reconcileCommittedKaelTurn(chat, streamed))
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
      commitSubmittedComposer()
      setComposerMediaDrafts([])
      setAgenticRejectOpen(false)
      setAgenticRejectReason('')
      if (conversations) void conversations.syncLinkedCaseSession(result.data.session.id)
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
      restoreSubmittedComposer()
      setError(localizeKaelRequestFailure(result, language))
    }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setLoading(false)
        setUploadingMedia(false)
        stopProcessLines()
        restoreSubmittedComposer()
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

async function reconcileCommittedKaelTurn(
  previous: KaelChatResponse,
  streamed: ApiResult<KaelChatResponse>,
): Promise<ApiResult<KaelChatResponse>> {
  if (streamed.success || !RECONCILABLE_KAEL_STREAM_FAILURES.has(streamed.code)) return streamed
  try {
    const recovered = await kaelChatService.get(previous.session.id)
    if (!recovered.success) return streamed
    const previousTurnIndex = previous.session.total_turns
    const newTurns = recovered.data.turns.filter((turn) => turn.turn_index > previousTurnIndex)
    const completed = newTurns.some((turn) => turn.role === 'customer') &&
      newTurns.some((turn) => turn.role === 'kael')
    return completed ? recovered : streamed
  } catch {
    return streamed
  }
}
