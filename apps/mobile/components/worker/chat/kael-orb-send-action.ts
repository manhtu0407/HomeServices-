import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { WorkerKaelChatMode } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatProgress, WorkerKaelChatResponse, WorkerKaelChatSession } from '@/lib/api-types'
import { generateClientRequestId } from '@/lib/client-request-id'
import { uploadJobMediaDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'
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
  activeJobIdRef: MutableRefObject<string | null>
  activeModeRef: MutableRefObject<WorkerKaelChatMode>
  activeOwnerRef: MutableRefObject<{ key: string }>
  advisoryUnavailableReply: string
  busy: boolean
  cacheSessionResponse: (response: WorkerKaelChatResponse) => void
  canUseKaelSession: boolean
  commitSessionSummary: (session: WorkerKaelChatSession) => void
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
  activeJobIdRef,
  activeModeRef,
  activeOwnerRef,
  advisoryUnavailableReply,
  busy,
  cacheSessionResponse,
  canUseKaelSession,
  commitSessionSummary,
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
    if (!content || busy || openingSessionId) return
    const sendRequestId = sendRequestRef.current + 1
    sendRequestRef.current = sendRequestId
    setError(null)
    reasoningActions.reset()
    setStreamingReply(null)
    setTurns((current) => [...current, { id: `worker-orb-${Date.now()}`, role: 'worker', text: content }])

    if (!canUseKaelSession) {
      setTurns((current) => [...current, { id: `kael-orb-${Date.now()}`, role: 'kael', text: advisoryUnavailableReply }])
      setMediaItems([])
      return
    }

    reasoningActions.begin()
    setBusy(true)
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
      'Kael đang không kết nối được. Không có hành động nào được ghi vào việc.',
      'Kael is unavailable. No work action was written.',
    )
    const incompleteReceiptMessage = textByLanguage(
      language,
      'Kael đã nhận được phản hồi, nhưng biên nhận xử lý chưa hoàn tất.',
      'Kael received a reply, but the processing receipt did not finish.',
    )
    try {
      let mediaRefs: string[] = []
      if (mediaItems.length > 0) {
        if (!currentJobId) {
          setError(textByLanguage(language, 'Ảnh chỉ dùng trong cuộc trò chuyện theo công việc.', 'Photos are only available in job conversations.'))
          return
        }
        const uploadDrafts: LocalMediaUploadDraft[] = mediaItems.map((item) => ({
          fileName: item.fileName,
          type: 'image',
          uri: item.uri,
        }))
        const uploaded = await uploadJobMediaDrafts(currentJobId, uploadDrafts, 'kael_reference')
        if (!isCurrentSend()) return
        if (!uploaded.success) {
          setError(uploaded.error)
          return
        }
        mediaRefs = uploaded.mediaRefs
      }

      let sessionId = sessionRef.current?.jobId === currentJobId
        && sessionRef.current.mode === currentMode
        ? sessionRef.current.sessionId
        : null
      if (!sessionId) {
        const created = await workerKaelChatService.create({
          client_request_id: generateClientRequestId(),
          language,
          mode: currentMode,
          ...(currentJobId ? { job_id: currentJobId } : {}),
        })
        if (!isCurrentSend()) return
        if (!created.success) {
          setProgress(null)
          setError(created.error)
          return
        }
        if (
          created.data.session.job_id !== currentJobId
          || created.data.session.mode !== currentMode
        ) {
          setProgress(null)
          setError(textByLanguage(language, 'Kael chưa mở được cuộc trò chuyện riêng cho việc này.', 'Kael could not open the private work session yet.'))
          return
        }
        sessionId = created.data.session.id
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

      const streamed = await workerKaelChatService.streamTurn(sessionId, {
        client_request_id: generateClientRequestId(),
        language,
        media_refs: mediaRefs,
        message: content,
      }, {
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
      })
      if (!isCurrentSend()) return

      let finalResponse = streamed.success ? streamed : null
      if (!finalResponse) {
        const recovered = await workerKaelChatService.get(sessionId)
        if (!isCurrentSend()) return
        if (recovered.success) finalResponse = recovered
      }

      if (
        !finalResponse
        || finalResponse.data.session.job_id !== currentJobId
        || finalResponse.data.session.mode !== currentMode
      ) {
        if (
          activeJobIdRef.current === currentJobId
          && activeModeRef.current === currentMode
        ) setProgress(null)
        setError(textByLanguage(language, 'Kael bỏ qua phản hồi không khớp việc hiện tại.', 'Kael ignored a response that did not match the current work.'))
        return
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
      if (sendRequestRef.current === sendRequestId) {
        if (!turnCompleted) reasoningActions.fail(interruptedMessage)
        setBusy(false)
      }
    }
  }
}
