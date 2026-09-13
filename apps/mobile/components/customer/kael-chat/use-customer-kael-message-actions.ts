import type { CaseWorkEvidence, LocalDeal, ServiceType } from '@nestscout/shared'
import { inferLocalDealDraftFromKael } from '@nestscout/shared'
import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'

import type { AppLanguage } from '@/lib/app-language'
import type { KaelStreamResponseDeltaEvent } from '@/lib/kael-stream'
import {
  appendLegacyKaelResponseDelta,
  completeLegacyKaelResponseStream,
  initialKaelResponseStreamState,
  kaelResponseStreamReducer,
  type KaelResponseStreamEvent,
} from '@/lib/kael-response-stream'
import {
  kaelReasoningReceiptReducer,
  type KaelReasoningStreamEvent,
} from '@/lib/kael-reasoning-receipt'
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
import {
  isPreAgenticConfirmation,
  preAgenticClarification,
  preAgenticConfirmation,
  preAgenticMissingDetails,
  preAgenticUnsupportedService,
} from './customer-kael-pre-agentic-copy'
import { applyCustomerKaelReasoningEvent } from './customer-kael-reasoning-actions'
import { customerKaelMessageLengthError } from './customer-kael-message-limits'
import type { CustomerKaelRequestGuard } from './customer-kael-state-scope'
import type { CustomerKaelMode } from '../ui/types'
import type { useCustomerKaelChatUiState } from './use-customer-kael-chat-ui-state'
import type { useCustomerKaelConversationState } from './use-customer-kael-conversation-state'
import type { useCustomerKaelConversations } from './use-customer-kael-conversations'
import type { useKaelProcessLineController } from './use-kael-process-line-controller'
import { reconcileCommittedKaelTurn } from './customer-kael-conversation-requests'
import { useCustomerKaelPreAgenticState } from './use-customer-kael-pre-agentic-state'

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
  const {
    getPendingState: getPendingPreAgenticIntake,
    ownerKey: preAgenticOwnerKey,
    setPendingState: setPendingPreAgenticIntake,
  } = useCustomerKaelPreAgenticState(
    requestOwnerKey,
    conversations?.activeSessionId ?? null,
  )
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
    setPendingNormalMessage,
    setReasoningReceipt,
    setStreamingReply,
    setTurns,
  } = conversation
  const {
    draft,
    setAgenticAdjustmentOpen,
    setAgenticAdjustmentText,
    setAgenticRejectOpen,
    setAgenticRejectReason,
    setDraft,
    setUploadingMedia,
    setVoiceTranscript,
    voiceTranscript,
  } = chatUi
  const {
    startBackendProcessLines,
    stopProcessLines,
    updateBackendProcessProgress,
  } = processController
  const settleStreamingReply = useCallback((responseId: string) => {
    setStreamingReply((current) => current?.responseId === responseId ? null : current)
  }, [setStreamingReply])
  const sendMessage = async (messageOverride?: string) => {
    const submittedDraft = messageOverride ?? draft
    const reviewedVoiceTranscript = messageOverride === undefined ? voiceTranscript.trim() : ''
    const message = submittedDraft.trim() || reviewedVoiceTranscript
    const hasComposerMedia = composerMediaDrafts.length > 0
    if (!message && !hasComposerMedia && !reviewedVoiceTranscript) return
    const messageLengthError = customerKaelMessageLengthError(message, language)
    if (messageLengthError) {
      setError(messageLengthError)
      return
    }
    if (sendOperationRef.current?.ownerKey === requestOwnerKey) return
    const sendOperation = { ownerKey: requestOwnerKey }
    sendOperationRef.current = sendOperation
    const requestToken = kaelRequestGuard.begin('message')
    let ownedStreamingTurnId: string | null = null
    let legacyStreamingTurnId: string | null = null
    let receivedResponseTerminal = false
    let retainStreamingReply = false
    const isSendOperationCurrent = () => sendOperationRef.current === sendOperation
    const appendVerifiedReply = (
      event: KaelStreamResponseDeltaEvent,
      isCurrent: () => boolean,
    ) => {
      if (!isCurrent()) return
      ownedStreamingTurnId = event.turnId
      legacyStreamingTurnId = event.turnId
      setStreamingReply((current) => {
        return appendLegacyKaelResponseDelta(current, event)
      })
    }
    const appendStreamingReply = (event: KaelStreamResponseDeltaEvent) => {
      appendVerifiedReply(event, () => kaelRequestGuard.isCurrent(requestToken))
    }
    const applyResponseEvent = (
      event: KaelResponseStreamEvent,
      isCurrent: () => boolean,
    ) => {
      if (!isCurrent()) return
      if (event.type === 'response.started') {
        legacyStreamingTurnId = null
        ownedStreamingTurnId = event.responseId
      }
      if (event.type === 'response.completed' && event.responseId === ownedStreamingTurnId) {
        receivedResponseTerminal = true
      }
      setStreamingReply((current) => kaelResponseStreamReducer(
        current ?? initialKaelResponseStreamState,
        event,
      ))
    }
    const applyStreamingResponseEvent = (event: KaelResponseStreamEvent) => {
      applyResponseEvent(event, () => kaelRequestGuard.isCurrent(requestToken))
    }
    const completeLegacyStreamingReply = () => {
      if (receivedResponseTerminal || !legacyStreamingTurnId) return
      receivedResponseTerminal = true
      setStreamingReply((current) => current?.responseId === legacyStreamingTurnId
        ? completeLegacyKaelResponseStream(current)
        : current)
    }
    let activeReasoningReceiptId: string | null = null
    let receivedReasoningTerminal = false
    const applyStreamingReasoningEvent = (event: KaelReasoningStreamEvent) => {
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (event.type === 'reasoning.started') activeReasoningReceiptId = event.receiptId
      if (
        (event.type === 'reasoning.completed' || event.type === 'reasoning.failed')
        && event.receiptId === activeReasoningReceiptId
      ) receivedReasoningTerminal = true
      applyCustomerKaelReasoningEvent(
        event,
        () => kaelRequestGuard.isCurrent(requestToken),
        setReasoningReceipt,
      )
    }
    const clearOwnedStreamingReply = (turnId: string) => {
      settleStreamingReply(turnId)
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
        if (!isSendOperationCurrent()) return false
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
      setDraft(submittedDraft)
      setVoiceTranscript(messageOverride === undefined ? voiceTranscript : '')
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
        setPendingNormalMessage(message)
        setReasoningReceipt((current) => kaelReasoningReceiptReducer(current, { type: 'begin' }))
        clearSubmittedComposer()
        setLoading(true)
        setError(null)
        try {
          const result = await conversations.sendConversationTurn(message, {
            onResponseCommitted: () => {
              setPendingNormalMessage(null)
            },
            onResponseDelta: appendStreamingReply,
            onResponseEvent: applyStreamingResponseEvent,
            onReasoning: applyStreamingReasoningEvent,
          })
          if (!kaelRequestGuard.isCurrent(requestToken)) return
          if (result) {
            if (!receivedReasoningTerminal) {
              if (activeReasoningReceiptId) {
                const incompleteReceiptMessage = language === 'vi'
                  ? 'Kael đã nhận được phản hồi, nhưng biên nhận xử lý chưa hoàn tất.'
                  : 'Kael received a reply, but the processing receipt did not finish.'
                setReasoningReceipt((current) => kaelReasoningReceiptReducer(current, {
                  message: incompleteReceiptMessage,
                  type: 'fail',
                }))
              } else {
                setReasoningReceipt((current) => kaelReasoningReceiptReducer(current, { type: 'reset' }))
              }
            }
            completeLegacyStreamingReply()
            retainStreamingReply = receivedResponseTerminal
            commitSubmittedComposer()
          } else {
            restoreSubmittedComposer()
            setPendingNormalMessage(null)
            const failureMessage = conversations.sessionsError ?? (language === 'vi'
              ? 'Kael chưa thể trả lời lúc này.'
              : 'Kael could not reply right now.')
            setReasoningReceipt((current) => kaelReasoningReceiptReducer(current, {
              message: failureMessage,
              type: 'fail',
            }))
            setError(failureMessage)
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
          startBackendProcessLines()
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
              {
                onReasoning: applyStreamingReasoningEvent,
                onResponseDelta: appendStreamingReply,
                onResponseEvent: applyStreamingResponseEvent,
                onStage: ({ progress }) => {
                  if (kaelRequestGuard.isCurrent(requestToken)) {
                    updateBackendProcessProgress(progress)
                  }
                },
              },
            )
            const result = await reconcileCommittedKaelTurn(activeAgenticChat, streamed)
            if (!kaelRequestGuard.isCurrent(requestToken)) return
            if (result.success) {
              completeLegacyStreamingReply()
              retainStreamingReply = receivedResponseTerminal
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

    const pendingPreAgenticState = getPendingPreAgenticIntake()
    const pendingPreAgentic = mode === 'case' && !chat && !deal &&
      pendingPreAgenticState?.ownerKey === preAgenticOwnerKey
      ? pendingPreAgenticState
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
      clearSubmittedComposer()
      try {
        const catalogResult = conversations
          ? await conversations.sendConversationTurn(message, {
              onResponseCommitted: () => {
                completeLegacyStreamingReply()
                retainStreamingReply = receivedResponseTerminal
              },
              onResponseDelta: appendStreamingReply,
              onResponseEvent: applyStreamingResponseEvent,
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
    if (shouldRunPreAgentic && inferredDraft?.unsupportedServiceLabel) {
      setPendingPreAgenticIntake(null)
      clearSubmittedComposer()
      setError(null)
      if (await revealLocalCaseExchange(
        message,
        preAgenticUnsupportedService(language, inferredDraft.unsupportedServiceLabel),
      )) {
        commitSubmittedComposer()
      }
      return
    }
    const missingPreAgenticDetails = shouldRunPreAgentic
      ? preAgenticMissingDetails(inferredDraft)
      : []
    if (shouldRunPreAgentic && !pendingPreAgentic) {
      const stage = inferredService && missingPreAgenticDetails.length === 0
        ? 'confirmation'
        : 'clarification'
      setPendingPreAgenticIntake({
        message,
        ownerKey: preAgenticOwnerKey,
        stage,
      })
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
      setPendingPreAgenticIntake(null)
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
      setPendingPreAgenticIntake({
        message: intakeMessage,
        ownerKey: preAgenticOwnerKey,
        stage: 'confirmation',
      })
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
    if (chat) startBackendProcessLines()
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
          {
            onReasoning: applyStreamingReasoningEvent,
            onResponseDelta: appendStreamingReply,
            onResponseEvent: applyStreamingResponseEvent,
            onStage: ({ progress }) => {
              if (kaelRequestGuard.isCurrent(requestToken)) {
                updateBackendProcessProgress(progress)
              }
            },
          },
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
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      completeLegacyStreamingReply()
      retainStreamingReply = receivedResponseTerminal
      setLoading(false)
      stopProcessLines()
      setChat(result.data)
      setTurns(result.data.turns)
      setAssistantTurns([])
      setPendingPreAgenticIntake(null)
      commitSubmittedComposer()
      setComposerMediaDrafts([])
      setAgenticAdjustmentOpen(false)
      setAgenticAdjustmentText('')
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
        const failureMessage = language === 'vi'
          ? 'Kael đang không kết nối được. Vui lòng thử lại.'
          : 'Kael is unavailable. Try again.'
        if (mode === 'normal' && conversations) {
          setPendingNormalMessage(null)
          setReasoningReceipt((current) => kaelReasoningReceiptReducer(current, {
            message: failureMessage,
            type: 'fail',
          }))
        }
        setError(failureMessage)
      }
    } finally {
      if (!retainStreamingReply) clearCurrentOwnedStreamingReply()
      if (sendOperationRef.current === sendOperation) sendOperationRef.current = null
    }
  }
  return { sendMessage, settleStreamingReply }
}
