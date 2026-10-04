import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { WorkerKaelChatMode } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatProgress, WorkerKaelChatResponse, WorkerKaelChatSession } from '@/lib/api-types'
import { generateClientRequestId } from '@/lib/client-request-id'
import {
  isAmbiguousKaelConversationFailure,
  kaelConversationOutcomeUncertainCopy,
  localizeKaelConversationFailure,
  unreleasedClientKaelCopy,
} from '@/lib/kael-conversation-failure'
import { cleanupKaelChatMediaRefs, uploadJobMediaDrafts, uploadKaelChatMediaDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'
import { workerKaelChatService } from '@/lib/services'
import {
  initialKaelResponseStreamState,
  kaelResponseStreamReducer,
  type KaelResponseStreamState,
} from '@/lib/kael-response-stream'

import {
  type WorkerV5KaelOrbLocalTurn,
  type WorkerV5KaelOrbMediaPreview,
  type WorkerV5KaelOrbSession,
  workerV5KaelOrbTurnsFromResponse,
} from './kael-orb-chat-model'
import type { createWorkerKaelReasoningActions } from './kael-orb-reasoning-actions'
import { textByLanguage } from '../ui/format'

type ReasoningActions = ReturnType<typeof createWorkerKaelReasoningActions>

type WorkerKaelOrbSendActionOptions = {
  abortControllerRef: MutableRefObject<AbortController | null>
  activeJobIdRef: MutableRefObject<string | null>
  activeModeRef: MutableRefObject<WorkerKaelChatMode>
  activeOwnerRef: MutableRefObject<{ key: string }>
  advisoryUnavailableReply: string
  busy: boolean
  cacheSessionResponse: (response: WorkerKaelChatResponse) => void
  canUseKaelSession: boolean
  commitSessionSummary: (session: WorkerKaelChatSession) => void
  getCachedSessionResponse: (sessionId: string) => WorkerKaelChatResponse | undefined
  isLocalVisualAuditSession: boolean
  language: AppLanguage
  locallyCreatedSessionIdsRef: MutableRefObject<Set<string>>
  mediaItems: WorkerV5KaelOrbMediaPreview[]
  mode: WorkerKaelChatMode
  openingSessionId: string | null
  owner: { key: string }
  reasoningActions: ReasoningActions
  sendRequestRef: MutableRefObject<number>
  sessionJobId: string | null
  sessionRef: MutableRefObject<WorkerV5KaelOrbSession | null>
  setActiveSessionId: Dispatch<SetStateAction<string | null>>
  setBusy: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
  setMediaItems: Dispatch<SetStateAction<WorkerV5KaelOrbMediaPreview[]>>
  setProgress: Dispatch<SetStateAction<KaelChatProgress | null>>
  setStreamingReply: Dispatch<SetStateAction<KaelResponseStreamState | null>>
  setTurns: Dispatch<SetStateAction<WorkerV5KaelOrbLocalTurn[]>>
}

export function createWorkerKaelOrbSendAction({
  abortControllerRef,
  activeJobIdRef,
  activeModeRef,
  activeOwnerRef,
  advisoryUnavailableReply,
  busy,
  cacheSessionResponse,
  canUseKaelSession,
  commitSessionSummary,
  getCachedSessionResponse,
  isLocalVisualAuditSession,
  language,
  locallyCreatedSessionIdsRef,
  mediaItems,
  mode,
  openingSessionId,
  owner,
  reasoningActions,
  sendRequestRef,
  sessionJobId,
  sessionRef,
  setActiveSessionId,
  setBusy,
  setError,
  setMediaItems,
  setProgress,
  setStreamingReply,
  setTurns,
}: WorkerKaelOrbSendActionOptions) {
  return async (message: string) => {
    const content = message.trim()
    const canSendImageOnly = mode === 'normal' && mediaItems.length > 0
    if ((!content && !canSendImageOnly) || busy || openingSessionId) return false
    if (isLocalVisualAuditSession) {
      setError(textByLanguage(
        language,
        'Chế độ xem trước chỉ dùng để kiểm tra giao diện. Đăng nhập tài khoản thợ thật để gửi tin nhắn.',
        'Preview audit mode is for visual checks only. Sign in with a real Worker account to send messages.',
      ))
      return false
    }
    const unreleasedClientCopy = unreleasedClientKaelCopy(language)
    if (unreleasedClientCopy) {
      setError(unreleasedClientCopy)
      return false
    }
    const sendRequestId = sendRequestRef.current + 1
    sendRequestRef.current = sendRequestId
    setError(null)
    reasoningActions.reset()
    setStreamingReply(null)
    const workerTurnId = `worker-orb-${Date.now()}`
    setTurns((current) => [...current, { id: workerTurnId, role: 'worker', text: content }])

    if (!canUseKaelSession) {
      setTurns((current) => [...current, { id: `kael-orb-${Date.now()}`, role: 'kael', text: advisoryUnavailableReply }])
      setMediaItems([])
      return false
    }

    reasoningActions.begin()
    setBusy(true)
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    const { signal } = abortController
    let cancelled = false
    // Stop before Kael committed anything: the draft stays in the composer, so the local bubble goes.
    const cancelSend = () => {
      cancelled = true
      setTurns((current) => current.filter((turn) => turn.id !== workerTurnId))
      setStreamingReply(null)
      if (activeJobIdRef.current === currentJobId && activeModeRef.current === currentMode) setProgress(null)
      setError(null)
      reasoningActions.reset()
      return false
    }
    const currentJobId = sessionJobId
    const currentMode = mode
    const currentOwner = owner
    const isCurrentSend = () => (
      sendRequestRef.current === sendRequestId
      && activeOwnerRef.current.key === currentOwner.key
      && activeJobIdRef.current === currentJobId
      && activeModeRef.current === currentMode
    )
    let turnCompleted = false
    let activeReasoningReceiptId: string | null = null
    let receivedReasoningTerminal = false
    const interruptedMessage = textByLanguage(
      language,
      'Kael chưa thể hoàn tất phản hồi này.',
      'Kael could not complete this reply yet.',
    )
    const incompleteReceiptMessage = textByLanguage(
      language,
      'Kael đã nhận được phản hồi, nhưng biên nhận xử lý chưa hoàn tất.',
      'Kael received a reply, but the processing receipt did not finish.',
    )
    try {
      let mediaRefs: string[] = []
      if (mediaItems.length > 0) {
        if (!currentJobId && currentMode !== 'normal') {
          setError(textByLanguage(language, 'Ảnh chỉ dùng trong cuộc trò chuyện theo công việc.', 'Photos are only available in job conversations.'))
          return false
        }
        const uploadDrafts: LocalMediaUploadDraft[] = mediaItems.map((item) => ({
          fileName: item.fileName,
          type: 'image',
          uri: item.uri,
        }))
        // A job conversation files photos with the job; general chat keeps them in the worker's own
        // Kael chat media, which re-encodes them and is checked for location data by the server.
        const uploaded = currentJobId
          ? await uploadJobMediaDrafts(currentJobId, uploadDrafts, 'kael_reference')
          : await uploadKaelChatMediaDrafts(uploadDrafts)
        if (!isCurrentSend()) return false
        if (!uploaded.success) {
          setError(uploaded.error)
          return false
        }
        if (signal.aborted) {
          if (!currentJobId) await cleanupKaelChatMediaRefs(uploaded.mediaRefs)
          return cancelSend()
        }
        mediaRefs = uploaded.mediaRefs
      }

      let sessionId = sessionRef.current?.jobId === currentJobId
        && sessionRef.current.mode === currentMode
        ? sessionRef.current.sessionId
        : null
      let previousTurnIds = new Set<string>()
      let hasSessionBaseline = false
      if (sessionId) {
        const cachedResponse = getCachedSessionResponse(sessionId)
        if (cachedResponse) {
          previousTurnIds = new Set(cachedResponse.turns.map((turn) => turn.id))
          hasSessionBaseline = true
        }
      }
      if (!sessionId) {
        const created = await workerKaelChatService.create({
          client_request_id: generateClientRequestId(),
          language,
          mode: currentMode,
          ...(currentJobId ? { job_id: currentJobId } : {}),
        })
        if (!isCurrentSend()) return false
        if (!created.success) {
          setProgress(null)
          setError(localizeKaelConversationFailure(
            created,
            language,
            textByLanguage(language, 'Chưa thể mở cuộc trò chuyện riêng cho việc này.', 'Kael could not open the private work session yet.'),
          ))
          return false
        }
        if (
          created.data.session.job_id !== currentJobId
          || created.data.session.mode !== currentMode
        ) {
          setProgress(null)
          setError(textByLanguage(language, 'Kael chưa mở được cuộc trò chuyện riêng cho việc này.', 'Kael could not open the private work session yet.'))
          return false
        }
        sessionId = created.data.session.id
        previousTurnIds = new Set(created.data.turns.map((turn) => turn.id))
        hasSessionBaseline = true
        locallyCreatedSessionIdsRef.current.add(sessionId)
        cacheSessionResponse(created.data)
        sessionRef.current = { jobId: currentJobId, mode: currentMode, sessionId }
        setActiveSessionId(sessionId)
        commitSessionSummary(created.data.session)
        if (
          created.data.session.progress
          && activeJobIdRef.current === currentJobId
          && activeModeRef.current === currentMode
        ) {
          setProgress(created.data.session.progress)
        }
      }

      if (signal.aborted) {
        if (mediaRefs.length > 0 && !currentJobId) await cleanupKaelChatMediaRefs(mediaRefs)
        return cancelSend()
      }
      const turnInput = {
        client_request_id: generateClientRequestId(),
        language,
        media_refs: mediaRefs,
        message: content,
      }
      const streamed = await workerKaelChatService.streamTurn(sessionId, turnInput, {
        onStage: (event) => {
          if (!isCurrentSend()) return
          setProgress(event.progress)
        },
        onReasoning: (event) => {
          if (!isCurrentSend()) return
          if (event.type === 'reasoning.started') activeReasoningReceiptId = event.receiptId
          if (
            (event.type === 'reasoning.completed' || event.type === 'reasoning.failed')
            && event.receiptId === activeReasoningReceiptId
          ) receivedReasoningTerminal = true
          reasoningActions.applyStreamEvent(event)
        },
        onResponseEvent: (event) => {
          if (!isCurrentSend()) return
          setStreamingReply((current) => kaelResponseStreamReducer(
            current ?? initialKaelResponseStreamState,
            event,
          ))
        },
        onToken: () => undefined,
      }, signal)
      if (!isCurrentSend()) return false

      const sent = !streamed.success && streamed.code === 'STREAM_UNSUPPORTED' && !signal.aborted
        ? await workerKaelChatService.sendTurn(sessionId, turnInput, signal)
        : streamed
      if (!isCurrentSend()) return false

      let finalResponse = sent.success ? sent : null
      if (!sent.success && sent.code === 'REQUEST_CANCELLED') {
        // The server may have committed the turn before the stop reached it: show it if it did.
        const recovered = await workerKaelChatService.get(sessionId)
        if (!isCurrentSend()) return false
        if (
          !recovered.success
          || recovered.data.session.id !== sessionId
          || !hasSessionBaseline
          || !hasSubmittedWorkerTurn(recovered.data, previousTurnIds, content)
        ) return cancelSend()
        if (!hasNewWorkerKaelReply(recovered.data, previousTurnIds, content)) {
          cancelled = true
          setStreamingReply(null)
          reasoningActions.reset()
          setError(kaelConversationOutcomeUncertainCopy(language))
          return false
        }
        finalResponse = recovered
      }

      if (!finalResponse && !sent.success && isAmbiguousKaelConversationFailure(sent)) {
        const recovered = await workerKaelChatService.get(sessionId)
        if (!isCurrentSend()) return false
        if (
          recovered.success
          && hasSessionBaseline
          && recovered.data.session.id === sessionId
          && hasNewWorkerKaelReply(recovered.data, previousTurnIds, content)
        ) finalResponse = recovered
      }

      if (!finalResponse) {
        if (
          activeJobIdRef.current === currentJobId
          && activeModeRef.current === currentMode
        ) setProgress(null)
        setStreamingReply(null)
        setError(!sent.success && isAmbiguousKaelConversationFailure(sent)
          ? kaelConversationOutcomeUncertainCopy(language)
          : !sent.success
            ? localizeKaelConversationFailure(
                sent,
                language,
                textByLanguage(language, 'Kael chưa thể trả lời lúc này. Vui lòng thử lại.', 'Kael could not reply right now. Please try again.'),
              )
            : textByLanguage(language, 'Kael chưa thể xác nhận phản hồi mới.', 'Kael could not confirm a new reply.'))
        return false
      }
      if (
        finalResponse.data.session.job_id !== currentJobId
        || finalResponse.data.session.mode !== currentMode
      ) {
        if (activeJobIdRef.current === currentJobId && activeModeRef.current === currentMode) setProgress(null)
        setStreamingReply(null)
        setError(textByLanguage(language, 'Kael bỏ qua phản hồi không khớp việc hiện tại.', 'Kael ignored a response that did not match the current work.'))
        return false
      }

      cacheSessionResponse(finalResponse.data)
      if (
        isCurrentSend()
        && sessionRef.current?.sessionId === finalResponse.data.session.id
      ) {
        sessionRef.current = {
          jobId: currentJobId,
          mode: currentMode,
          sessionId: finalResponse.data.session.id,
        }
        setActiveSessionId(finalResponse.data.session.id)
        setProgress(finalResponse.data.session.progress)
        setTurns(workerV5KaelOrbTurnsFromResponse(finalResponse.data.turns))
        setMediaItems([])
        commitSessionSummary(finalResponse.data.session)
        if (!receivedReasoningTerminal) {
          if (activeReasoningReceiptId) {
            reasoningActions.fail(incompleteReceiptMessage)
          } else {
            reasoningActions.reset()
          }
        }
        turnCompleted = true
      }
    } catch {
      if (isCurrentSend()) {
        setError(interruptedMessage)
      }
    } finally {
      if (abortControllerRef.current === abortController) abortControllerRef.current = null
      if (sendRequestRef.current === sendRequestId) {
        if (!turnCompleted && !cancelled) reasoningActions.fail(interruptedMessage)
        setBusy(false)
      }
    }
    return turnCompleted
  }
}

function hasSubmittedWorkerTurn(
  response: WorkerKaelChatResponse,
  previousTurnIds: Set<string>,
  submittedText: string,
) {
  return response.turns.some((turn) => (
    !previousTurnIds.has(turn.id) && turn.role === 'worker' && turn.text_content?.trim() === submittedText
  ))
}

function hasNewWorkerKaelReply(
  response: WorkerKaelChatResponse,
  previousTurnIds: Set<string>,
  submittedText: string,
) {
  const newTurns = response.turns.filter((turn) => !previousTurnIds.has(turn.id))
  let submittedTurnIndex = -1
  for (const turn of newTurns) {
    if (turn.role === 'worker' && turn.text_content?.trim() === submittedText && turn.turn_index > submittedTurnIndex) {
      submittedTurnIndex = turn.turn_index
    }
  }
  return submittedTurnIndex >= 0 && newTurns.some((turn) => (
    turn.role === 'kael' && turn.turn_index > submittedTurnIndex
  ))
}
