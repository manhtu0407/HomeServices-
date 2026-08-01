import type { CaseWorkEvidence, LocalDeal, LocalDealDraft, ServiceType } from '@nestscout/shared'
import { inferLocalDealDraftFromKael } from '@nestscout/shared'
import { useEffect, useRef, type MutableRefObject } from 'react'

import type { AppLanguage } from '@/lib/app-language'
import type { ApiResult } from '@/lib/api'
import type { KaelChatResponse } from '@/lib/api-types'
import type { KaelStreamResponseDeltaEvent } from '@/lib/kael-stream'
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
import { revealVerifiedResponse } from '@/lib/verified-response-reveal'

import {
  formatAssistantAnswer,
  isLikelyKaelIntakeRequest,
  localizeKaelRequestFailure,
  makeAssistantTurnId,
  shouldFallbackCaseAssistantToJobChat,
} from './customer-kael-chat-helpers'
import type { CustomerKaelRequestGuard } from './customer-kael-state-scope'
import type { CustomerKaelMode } from '../ui/types'
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

type PendingPreAgenticIntake = {
  message: string
  ownerKey: string
  stage: 'clarification' | 'confirmation'
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
  const pendingPreAgenticIntakeRef = useRef<PendingPreAgenticIntake | null>(null)
  const sendOperationRef = useRef<{ ownerKey: string } | null>(null)
  useEffect(() => () => {
    sendOperationRef.current = null
  }, [])
  const {
    chat,
    composerMediaDrafts,
    pendingDraft,
    setAssistantTurns,
    setChat,
    setComposerMediaDrafts,
    setError,
    setLoading,
    setStreamingReply,
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
    const requestToken = kaelRequestGuard.begin('message')
    let ownedStreamingTurnId: string | null = null
    const isSendOperationCurrent = () => sendOperationRef.current === sendOperation
    const appendVerifiedReply = (
      event: KaelStreamResponseDeltaEvent,
      isCurrent: () => boolean,
    ) => {
      if (!isCurrent()) return
      ownedStreamingTurnId = event.turnId
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
    const appendStreamingReply = (event: KaelStreamResponseDeltaEvent) => {
      appendVerifiedReply(event, () => kaelRequestGuard.isCurrent(requestToken))
    }
    const appendLocalVerifiedReply = (event: KaelStreamResponseDeltaEvent) => {
      appendVerifiedReply(event, isSendOperationCurrent)
    }
    const clearOwnedStreamingReply = (turnId: string) => {
      setStreamingReply((current) => {
        return current?.turnId === turnId ? null : current
      })
    }
    const clearCurrentOwnedStreamingReply = () => {
      if (ownedStreamingTurnId) clearOwnedStreamingReply(ownedStreamingTurnId)
    }
    const revealLocalCaseExchange = async (customerText: string, kaelText: string) => {
      const customerTurnId = makeAssistantTurnId('customer_case', 'customer')
      const kaelTurnId = makeAssistantTurnId('customer_case', 'kael')
      setLoading(true)
      setAssistantTurns((current) => [
        ...current,
        {
          id: customerTurnId,
          role: 'customer',
          surface: 'customer_case',
          text_content: customerText,
        },
      ])
      try {
        const revealed = await revealVerifiedResponse({
          isCurrent: isSendOperationCurrent,
          onDelta: appendLocalVerifiedReply,
          text: kaelText,
          turnId: kaelTurnId,
        })
        if (!revealed || !isSendOperationCurrent()) return false
        clearOwnedStreamingReply(kaelTurnId)
        setAssistantTurns((current) => [
          ...current,
          {
            id: kaelTurnId,
            role: 'kael',
            surface: 'customer_case',
            text_content: kaelText,
          },
        ])
        return true
      } finally {
        clearOwnedStreamingReply(kaelTurnId)
        if (isSendOperationCurrent()) setLoading(false)
      }
    }
    setStreamingReply(null)
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
          const result = await conversations.sendConversationTurn(message, {
            onResponseCommitted: clearCurrentOwnedStreamingReply,
            onResponseDelta: appendStreamingReply,
            revealAfter: processDone,
          })
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
            const streamed = await kaelChatStreamService.sendTurn(
              activeAgenticChat.session.id,
              {
                language,
                message,
                photo_urls: [],
              },
              { onResponseDelta: appendStreamingReply },
            )
            const result = await reconcileCommittedKaelTurn(activeAgenticChat, streamed)
            if (!kaelRequestGuard.isCurrent(requestToken)) return
            if (result.success) {
              await processDone
              if (!kaelRequestGuard.isCurrent(requestToken)) return
              setStreamingReply(null)
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

    const pendingPreAgentic = mode === 'case' && !chat && !deal &&
      pendingPreAgenticIntakeRef.current?.ownerKey === requestOwnerKey
      ? pendingPreAgenticIntakeRef.current
      : null
    const shouldRunPreAgentic = mode === 'case' && !chat && !deal && !selectedService
    const confirmationReply = pendingPreAgentic?.stage === 'confirmation' &&
      isPreAgenticConfirmation(message)
    const intakeMessage = pendingPreAgentic
      ? (confirmationReply ? pendingPreAgentic.message : `${pendingPreAgentic.message}\n${message}`)
      : message
    const intakeIntent = isLikelyKaelIntakeRequest(intakeMessage)
    const inferredDraft = selectedService ? null : inferLocalDealDraftFromKael(intakeMessage)
    const shouldUseIntake = mode === 'case' || Boolean(
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
          ? await conversations.sendConversationTurn(message, {
              onResponseCommitted: clearCurrentOwnedStreamingReply,
              onResponseDelta: appendStreamingReply,
              revealAfter: processDone,
            })
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
    const missingPreAgenticDetails = shouldRunPreAgentic
      ? preAgenticMissingDetails(inferredDraft)
      : []
    if (shouldRunPreAgentic && !pendingPreAgentic) {
      const stage = inferredService && missingPreAgenticDetails.length === 0
        ? 'confirmation'
        : 'clarification'
      pendingPreAgenticIntakeRef.current = {
        message,
        ownerKey: requestOwnerKey,
        stage,
      }
      clearSubmittedComposer()
      setError(null)
      const preAgenticReply = stage === 'confirmation'
        ? preAgenticConfirmation(language, inferredDraft)
        : preAgenticClarification(language, missingPreAgenticDetails)
      if (await revealLocalCaseExchange(message, preAgenticReply)) {
        commitSubmittedComposer()
      }
      return
    }
    if (shouldRunPreAgentic && pendingPreAgentic?.stage === 'confirmation' && !confirmationReply) {
      pendingPreAgenticIntakeRef.current = null
      setError(language === 'vi'
        ? 'Để chỉnh thông tin, hãy gửi lại mô tả đã cập nhật trong một tin nhắn mới.'
        : 'To revise the details, send the updated description as a new message.')
      return
    }
    if (shouldRunPreAgentic && pendingPreAgentic?.stage === 'clarification') {
      if (!inferredService || missingPreAgenticDetails.length > 0) {
        setError(preAgenticClarification(language, missingPreAgenticDetails))
        return
      }
      pendingPreAgenticIntakeRef.current = {
        message: intakeMessage,
        ownerKey: requestOwnerKey,
        stage: 'confirmation',
      }
      clearSubmittedComposer()
      setError(null)
      if (await revealLocalCaseExchange(
        message,
        preAgenticConfirmation(language, inferredDraft),
      )) {
        commitSubmittedComposer()
      }
      return
    }
    if (!inferredService) {
      setError(language === 'vi'
        ? 'Để Kael bắt đầu xử lý, bạn hãy nêu hạng mục cần hỗ trợ: sửa điện, sửa nước, vệ sinh nhà, điều hòa, chăm sóc nội thất hoặc sửa vặt/lắp đặt.'
        : 'To begin, Kael needs the service category: electrical, plumbing, home cleaning, air conditioning, upholstery care, or handyman work.')
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
    const outgoingMessage = intakeMessage || (language === 'vi' ? 'Đã gửi ảnh/video.' : 'Sent media.')
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
      ? await kaelChatStreamService.sendTurn(
          chat.session.id,
          {
            evidence_items: evidenceItems,
            language,
            message: outgoingMessage,
            photo_urls: photoUrls,
          },
          { onResponseDelta: appendStreamingReply },
        ).then((streamed) => reconcileCommittedKaelTurn(chat, streamed))
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
      if (!chat) {
        const initialReply = latestKaelReply(result.data)
        if (initialReply) {
          const revealed = await revealVerifiedResponse({
            isCurrent: () => kaelRequestGuard.isCurrent(requestToken),
            onDelta: appendStreamingReply,
            text: initialReply.text,
            turnId: initialReply.turnId,
          })
          if (!revealed || !kaelRequestGuard.isCurrent(requestToken)) return
        }
      }
      setLoading(false)
      stopProcessLines()
      setStreamingReply(null)
      setChat(result.data)
      setTurns(result.data.turns)
      pendingPreAgenticIntakeRef.current = null
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
      clearCurrentOwnedStreamingReply()
      if (sendOperationRef.current === sendOperation) sendOperationRef.current = null
    }
  }

  return { sendMessage }
}

function isPreAgenticConfirmation(message: string) {
  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
  return /^(xac nhan|confirm|dung|dung roi|dong y|ok|okay|yes)$/.test(normalized)
}

function preAgenticMissingDetails(draft: LocalDealDraft | null) {
  const missing: string[] = []
  if (!draft?.serviceType) missing.push('hạng mục cần hỗ trợ')
  if (!draft?.inferredProblemLabel) missing.push('hiện tượng hoặc thiết bị gặp vấn đề')
  if (!draft?.districtLabel) missing.push('quận tại TP.HCM')
  return missing
}

function preAgenticClarification(language: AppLanguage, missingDetails: string[]) {
  if (language === 'vi') {
    const details = missingDetails.length > 0
      ? missingDetails.join(', ')
      : 'thông tin còn thiếu'
    const supportedServices = missingDetails.includes('hạng mục cần hỗ trợ')
      ? ' Hạng mục hỗ trợ gồm: sửa điện, sửa nước, vệ sinh nhà, điều hòa, chăm sóc nội thất hoặc sửa vặt/lắp đặt.'
      : ''
    return `Mình đã ghi nhận mô tả. Trước khi Kael bắt đầu, bạn cho biết ${details} trong một tin nhắn nhé.${supportedServices}`
  }
  return 'I have noted your description. Before Kael begins, please provide the service, the affected item or symptom, and the district in Ho Chi Minh City in one message. Supported services are electrical, plumbing, home cleaning, air conditioning, upholstery care, and handyman work.'
}

function preAgenticConfirmation(language: AppLanguage, draft: LocalDealDraft | null) {
  const detail = [draft?.inferredProblemLabel, draft?.districtLabel].filter(Boolean).join(' tại ')
  if (language === 'vi') {
    return `Kael hiểu yêu cầu là ${detail || 'hạng mục bạn vừa mô tả'}. Đúng không? Nhắn “Xác nhận” để Kael bắt đầu phân tích.`
  }
  return `Kael understands the request as ${detail || 'the work you described'}. Is that correct? Reply “Confirm” for Kael to begin analysis.`
}

function latestKaelReply(response: KaelChatResponse) {
  for (let index = response.turns.length - 1; index >= 0; index -= 1) {
    const turn = response.turns[index]
    if (turn.role !== 'kael' || typeof turn.text_content !== 'string') continue
    const text = turn.text_content.trim()
    if (!text) continue
    return {
      text,
      turnId: turn.id,
    }
  }
  return null
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
