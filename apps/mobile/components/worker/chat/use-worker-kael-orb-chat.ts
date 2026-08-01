import { useLayoutEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import type { LocalDeal } from '@nestscout/shared'
import type { KaelChatProgress, WorkerKaelChatTurn } from '@/lib/api-types'
import type { AppLanguage } from '@/lib/app-language'
import {
  clearStableClientRequestId,
  stableClientRequestId,
  type PendingClientRequestRef,
} from '@/lib/client-request-id'
import {
  localizeMediaUploadFailure,
  uploadJobMediaDrafts,
  type LocalMediaUploadDraft,
} from '@/lib/media-upload'
import { workerKaelChatService } from '@/lib/services'
import { getWorkerV5ChatJobId } from '../ui/labels'
import { textByLanguage } from '../ui/format'

export type WorkerV5PrivateKaelLocalTurn = {
  id: string
  role: 'kael' | 'worker'
  text: string
}

export type WorkerV5PrivateKaelMediaPreview = {
  fileName: string
  uri: string
}

export type WorkerV5PrivateKaelSession = {
  jobId: string
  sessionId: string
}

type WorkerV5KaelOrbChatState = {
  busy: boolean
  error: string | null
  mediaItems: WorkerV5PrivateKaelMediaPreview[]
  ownerKey: string
  progress: KaelChatProgress | null
  session: WorkerV5PrivateKaelSession | null
  turns: WorkerV5PrivateKaelLocalTurn[]
}

type WorkerV5KaelOrbChatOwner = {
  ownerKey: string
}

type WorkerV5KaelOrbStoredChatState = {
  owner: WorkerV5KaelOrbChatOwner
  state: WorkerV5KaelOrbChatState
}

type WorkerV5KaelOrbPendingTurn = {
  fingerprint: string
  mediaRefs: string[] | null
  requestRef: PendingClientRequestRef
}

type WorkerV5KaelOrbPendingRequests = {
  createRef: PendingClientRequestRef
  owner: WorkerV5KaelOrbChatOwner
  turn: WorkerV5KaelOrbPendingTurn | null
}

function createWorkerV5KaelOrbChatState(ownerKey: string): WorkerV5KaelOrbChatState {
  return {
    busy: false,
    error: null,
    mediaItems: [],
    ownerKey,
    progress: null,
    session: null,
    turns: [],
  }
}

export function canUseWorkerV5PrivateKaelChat(deal: LocalDeal | null) {
  const status = deal?.backendStatus ?? deal?.status
  return Boolean(status && [
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing',
    'scope_change_pending',
    'completed_by_worker',
  ].includes(status))
}

export function workerV5PrivateKaelMediaName(
  asset: ImagePicker.ImagePickerAsset,
  index: number,
  language: AppLanguage,
) {
  const fileName = asset.fileName?.trim()
  if (fileName) return fileName
  return textByLanguage(language, `anh-hien-truong-${index + 1}.jpg`, `onsite-photo-${index + 1}.jpg`)
}

function isWorkerV5PrivateKaelReadOnly(deal: LocalDeal | null) {
  const status = deal?.backendStatus ?? deal?.status ?? null
  return status === 'payment_pending' || status === 'paid' || status === 'reviewed'
}

function workerV5PrivateKaelTurnsFromResponse(
  turns: WorkerKaelChatTurn[],
): WorkerV5PrivateKaelLocalTurn[] {
  const localTurns: WorkerV5PrivateKaelLocalTurn[] = []
  for (const turn of turns) {
    if ((turn.role === 'worker' || turn.role === 'kael') && turn.text_content) {
      localTurns.push({
        id: turn.id,
        role: turn.role,
        text: turn.text_content,
      })
    }
  }
  return localTurns
}

export function useWorkerV5KaelOrbChat(deal: LocalDeal | null, language: AppLanguage) {
  const jobId = getWorkerV5ChatJobId(deal)
  const ownerKey = jobId ?? 'no-active-job'
  const [stored, setStored] = useState<WorkerV5KaelOrbStoredChatState>(() => {
    const owner = { ownerKey }
    return { owner, state: createWorkerV5KaelOrbChatState(ownerKey) }
  })
  let visibleStored = stored
  if (stored.owner.ownerKey !== ownerKey) {
    visibleStored = {
      owner: { ownerKey },
      state: createWorkerV5KaelOrbChatState(ownerKey),
    }
    setStored(visibleStored)
  }
  const owner = visibleStored.owner
  const activeOwnerRef = useRef(owner)
  const requestOwnerRef = useRef<WorkerV5KaelOrbChatOwner | null>(null)
  const pendingRequestsRef = useRef<WorkerV5KaelOrbPendingRequests>({
    createRef: { current: null },
    owner,
    turn: null,
  })
  useLayoutEffect(() => {
    activeOwnerRef.current = owner
    if (pendingRequestsRef.current.owner !== owner) {
      pendingRequestsRef.current = {
        createRef: { current: null },
        owner,
        turn: null,
      }
    }
  }, [owner])

  const state = visibleStored.state
  const readOnly = isWorkerV5PrivateKaelReadOnly(deal)
  const hasPrivateKaelSessionAccess = Boolean(jobId) && canUseWorkerV5PrivateKaelChat(deal) && !readOnly

  const updateOwnerState = (
    targetOwnerKey: string,
    update: (current: WorkerV5KaelOrbChatState) => WorkerV5KaelOrbChatState,
  ) => {
    setStored((current) => {
      if (targetOwnerKey !== owner.ownerKey || activeOwnerRef.current !== owner) return current
      const ownedState = current.owner === owner
        ? current.state
        : createWorkerV5KaelOrbChatState(targetOwnerKey)
      return { owner, state: update(ownedState) }
    })
  }

  const advisoryUnavailableReply = readOnly
    ? textByLanguage(language, 'Chat chỉ còn đọc lại sau cổng thanh toán.', 'Chat is read-only after the payment gate.')
    : textByLanguage(
        language,
        'Mình chưa có phiên Kael theo công việc để gửi câu hỏi này. Khi bạn có việc đang thực hiện, tin nhắn sẽ được gửi qua kênh tư vấn riêng.',
        'There is no job-scoped Kael session for this question yet. Once you have active work, messages go through the private advisory channel.',
      )
  const progressPercent = state.progress
    ? Math.max(0, Math.min(100, Math.round(state.progress.progress * 100)))
    : null
  const busyLabel = state.busy
    ? progressPercent != null
      ? textByLanguage(language, `Kael đang xử lý... ${progressPercent}%`, `Kael is working... ${progressPercent}%`)
      : textByLanguage(language, 'Kael đang xử lý...', 'Kael is working...')
    : null

  const pickMedia = async () => {
    if (state.busy) return
    const targetOwnerKey = ownerKey
    if (!hasPrivateKaelSessionAccess) {
      Alert.alert('Kael', textByLanguage(language, 'Cần việc đang thực hiện để gửi ảnh cho Kael.', 'Active work is needed to send a photo to Kael.'))
      return
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Kael', textByLanguage(language, 'Cần quyền thư viện ảnh để thêm ảnh cho Kael.', 'Photo library permission is needed to add a photo for Kael.'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.84,
    })
    if (result.canceled || result.assets.length === 0) return
    const asset = result.assets[0]
    updateOwnerState(targetOwnerKey, (current) => ({
      ...current,
      mediaItems: [{ fileName: workerV5PrivateKaelMediaName(asset, 0, language), uri: asset.uri }],
    }))
  }

  const send = async (message: string) => {
    const content = message.trim()
    if (!content || state.busy || requestOwnerRef.current === owner) return
    const targetOwnerKey = ownerKey
    const logicalTurnFingerprint = JSON.stringify({
      job_id: jobId,
      language,
      media: state.mediaItems.map((item) => ({ fileName: item.fileName, uri: item.uri })),
      message: content,
    })
    const pendingRequests = pendingRequestsRef.current
    const retryingPendingTurn = pendingRequests.turn?.fingerprint === logicalTurnFingerprint
    if (!retryingPendingTurn) {
      pendingRequests.turn = {
        fingerprint: logicalTurnFingerprint,
        mediaRefs: null,
        requestRef: { current: null },
      }
    }
    updateOwnerState(targetOwnerKey, (current) => ({
      ...current,
      error: null,
      turns: retryingPendingTurn
        ? current.turns
        : [...current.turns, { id: `worker-orb-${Date.now()}`, role: 'worker', text: content }],
    }))

    if (!hasPrivateKaelSessionAccess || !jobId) {
      updateOwnerState(targetOwnerKey, (current) => ({
        ...current,
        mediaItems: [],
        turns: [...current.turns, { id: `kael-orb-${Date.now()}`, role: 'kael', text: advisoryUnavailableReply }],
      }))
      return
    }

    requestOwnerRef.current = owner
    updateOwnerState(targetOwnerKey, (current) => ({ ...current, busy: true }))
    const currentJobId = jobId
    const priorTurnIds = new Set(state.turns.map((turn) => turn.id))
    try {
      const pendingTurn = pendingRequests.turn
      let mediaRefs = pendingTurn?.mediaRefs ?? []
      if (pendingTurn && pendingTurn.mediaRefs === null && state.mediaItems.length > 0) {
        const uploadDrafts: LocalMediaUploadDraft[] = state.mediaItems.map((item) => ({
          fileName: item.fileName,
          type: 'image',
          uri: item.uri,
        }))
        const uploaded = await uploadJobMediaDrafts(currentJobId, uploadDrafts, 'kael_reference')
        if (!uploaded.success) {
          updateOwnerState(targetOwnerKey, (current) => ({
            ...current,
            error: localizeMediaUploadFailure(uploaded, language),
          }))
          return
        }
        mediaRefs = uploaded.mediaRefs
        pendingTurn.mediaRefs = mediaRefs
      } else if (pendingTurn && pendingTurn.mediaRefs === null) {
        pendingTurn.mediaRefs = []
      }

      let sessionId = state.session?.jobId === currentJobId ? state.session.sessionId : null
      if (!sessionId) {
        const createFingerprint = JSON.stringify({ job_id: currentJobId, language })
        const created = await workerKaelChatService.create({
          client_request_id: stableClientRequestId(
            pendingRequests.createRef,
            createFingerprint,
          ),
          job_id: currentJobId,
          language,
          mode: 'normal',
        })
        if (!created.success || created.data.session.job_id !== currentJobId) {
          updateOwnerState(targetOwnerKey, (current) => ({
            ...current,
            error: textByLanguage(language, 'Kael chưa mở được phiên riêng cho việc này.', 'Kael could not open the private work session yet.'),
            progress: null,
          }))
          return
        }
        const createdSessionId = created.data.session.id
        sessionId = createdSessionId
        clearStableClientRequestId(
          pendingRequests.createRef,
          createFingerprint,
        )
        updateOwnerState(targetOwnerKey, (current) => ({
          ...current,
          progress: created.data.session.progress ?? current.progress,
          session: { jobId: currentJobId, sessionId: createdSessionId },
        }))
      }

      const requestFingerprint = JSON.stringify({
        logical_turn: logicalTurnFingerprint,
        media_refs: mediaRefs,
        session_id: sessionId,
      })
      const streamed = await workerKaelChatService.streamTurn(sessionId, {
        client_request_id: stableClientRequestId(
          pendingRequests.turn?.requestRef ?? { current: null },
          requestFingerprint,
        ),
        language,
        media_refs: mediaRefs,
        message: content,
      }, {
        onStage: (event) => {
          updateOwnerState(targetOwnerKey, (current) => ({ ...current, progress: event.progress }))
        },
        onToken: () => undefined,
      })

      let finalResponse = streamed.success ? streamed : null
      if (!finalResponse) {
        const recovered = await workerKaelChatService.get(sessionId)
        const recoveredTurn = recovered.success && recovered.data.turns.some((turn) => (
          !priorTurnIds.has(turn.id) &&
          turn.role === 'worker' &&
          turn.text_content?.trim() === content &&
          turn.media_refs.length === mediaRefs.length &&
          turn.media_refs.every((mediaRef, index) => mediaRef === mediaRefs[index])
        ))
        if (recovered.success && recoveredTurn) finalResponse = recovered
      }

      if (!finalResponse || finalResponse.data.session.job_id !== currentJobId) {
        updateOwnerState(targetOwnerKey, (current) => ({
          ...current,
          error: textByLanguage(language, 'Kael bỏ qua phản hồi không khớp việc hiện tại.', 'Kael ignored a response that did not match the current work.'),
          progress: null,
        }))
        return
      }

      updateOwnerState(targetOwnerKey, (current) => ({
        ...current,
        mediaItems: [],
        progress: finalResponse.data.session.progress,
        session: { jobId: currentJobId, sessionId: finalResponse.data.session.id },
        turns: workerV5PrivateKaelTurnsFromResponse(finalResponse.data.turns),
      }))
      pendingRequests.turn = null
    } catch {
      updateOwnerState(targetOwnerKey, (current) => ({
        ...current,
        error: textByLanguage(language, 'Kael đang không kết nối được. Không có hành động nào được ghi vào việc.', 'Kael is unavailable. No work action was written.'),
      }))
    } finally {
      if (requestOwnerRef.current === owner) requestOwnerRef.current = null
      updateOwnerState(targetOwnerKey, (current) => ({ ...current, busy: false }))
    }
  }

  return {
    busy: state.busy,
    busyLabel,
    error: state.error,
    liveTurns: state.turns,
    mediaCount: state.mediaItems.length,
    pickMedia,
    send,
  }
}
