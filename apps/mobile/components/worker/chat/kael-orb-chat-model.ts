import type { ImagePickerAsset } from 'expo-image-picker'
import type { LocalDeal, WorkerKaelChatMode } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import { kaelChatTurnImages, localKaelChatMediaUri, type KaelChatTurnImage } from '@/lib/kael-chat-local-media'
import type { WorkerKaelChatSession, WorkerKaelChatTurn } from '@/lib/api-types'
import { textByLanguage } from '../ui/format'

export type WorkerV5KaelOrbLocalTurn = {
  id: string
  images?: KaelChatTurnImage[]
  role: 'kael' | 'worker'
  text: string
}

export type WorkerV5KaelOrbMediaPreview = {
  fileName: string
  uri: string
}

export type WorkerV5KaelOrbSession = {
  jobId: string | null
  mode: WorkerKaelChatMode
  sessionId: string
}

export type WorkerV5KaelSessionListRequest = {
  catalogKey: string
  promise: Promise<void>
}

export const PREFETCH_SESSION_LIMIT = 4

export function canShowWorkerStaticNormalChatStarters(
  mode: 'normal' | 'intake',
  liveTurnCount: number,
) {
  return mode === 'normal' && liveTurnCount === 0
}

export function workerV5KaelAdvisoryUnavailableReply(
  readOnly: boolean,
  language: AppLanguage,
) {
  return readOnly
    ? textByLanguage(language, 'Chat chỉ còn đọc lại sau cổng thanh toán.', 'Chat is read-only after the payment gate.')
    : textByLanguage(
        language,
        'Mình chưa có phiên Kael theo công việc để gửi câu hỏi này. Khi bạn có việc đang thực hiện, tin nhắn sẽ được gửi qua kênh tư vấn riêng.',
        'There is no job-scoped Kael session for this question yet. Once you have active work, messages go through the private advisory channel.',
      )
}

export function canUseWorkerV5KaelOrbSession(deal: LocalDeal | null) {
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

export function isWorkerV5KaelOrbReadOnly(deal: LocalDeal | null) {
  const status = deal?.backendStatus ?? deal?.status ?? null
  return status === 'payment_pending' || status === 'paid' || status === 'reviewed'
}

export function upsertWorkerV5KaelOrbSession(
  sessions: WorkerKaelChatSession[],
  nextSession: WorkerKaelChatSession,
): WorkerKaelChatSession[] {
  const next = [nextSession, ...sessions.filter((session) => session.id !== nextSession.id)]
  return [
    ...next.filter((session) => Boolean(session.pinned_at)),
    ...next.filter((session) => !session.pinned_at),
  ]
}

export function reconcileWorkerV5KaelSessionCatalog(
  listedSessions: WorkerKaelChatSession[],
  currentCatalog: WorkerKaelChatSession[],
  workerId: string,
  mode: WorkerKaelChatMode,
  locallyCreatedSessionIds: Set<string>,
  locallyUpdatedSessionIds: Set<string>,
  pendingSessionIds: string[],
  removedSessionIds: Set<string>,
  trustServerScopedWorkerId = false,
): WorkerKaelChatSession[] {
  const catalogOwnerId = trustServerScopedWorkerId
    ? listedSessions[0]?.worker_id ?? currentCatalog[0]?.worker_id ?? null
    : workerId
  const safeListedSessions = listedSessions.filter((session) => (
    session.worker_id === catalogOwnerId
    && session.mode === mode
    && !removedSessionIds.has(session.id)
  ))
  const safeCurrentCatalog = currentCatalog.filter((session) => (
    session.worker_id === catalogOwnerId && session.mode === mode
  ))
  const currentById = new Map(safeCurrentCatalog.map((session) => [session.id, session]))
  const listedIds = new Set(safeListedSessions.map((session) => session.id))
  for (const listedId of listedIds) locallyCreatedSessionIds.delete(listedId)
  const reconciled = [
    ...safeCurrentCatalog.filter((session) => (
      locallyCreatedSessionIds.has(session.id)
      && !listedIds.has(session.id)
      && !removedSessionIds.has(session.id)
    )),
    ...safeListedSessions.map((session) => (
      pendingSessionIds.includes(session.id) || locallyUpdatedSessionIds.has(session.id)
        ? currentById.get(session.id) ?? session
        : session
    )),
  ]
  return [
    ...reconciled.filter((session) => Boolean(session.pinned_at)),
    ...reconciled.filter((session) => !session.pinned_at),
  ]
}

export function workerKaelSessionCatalogKey(workerId: string, mode: WorkerKaelChatMode) {
  return `${workerId}:${mode}`
}

export function workerKaelSessionMatchesScope(
  session: Pick<WorkerKaelChatSession, 'job_id' | 'mode'>,
  jobId: string | null,
  mode: WorkerKaelChatMode,
) {
  return session.job_id === jobId && session.mode === mode
}

export function workerV5KaelOrbTurnsFromResponse(
  turns: WorkerKaelChatTurn[],
): WorkerV5KaelOrbLocalTurn[] {
  return turns
    .flatMap((turn) => {
      if (turn.role !== 'worker' && turn.role !== 'kael') return []
      const images = turn.role === 'worker' ? workerTurnImages(turn) : []
      if (!turn.text_content && images.length === 0) return []
      return [{ id: turn.id, images, role: turn.role, text: turn.text_content ?? '' }]
    })
}

// General-chat photos live in Kael chat media and come back with preview links. Job-conversation
// photos are filed with the job and carry none, so only this device's copies of them are shown.
function workerTurnImages(turn: WorkerKaelChatTurn) {
  const shownRefs = turn.media_refs.filter((mediaRef) =>
    mediaRef.startsWith('supabase://kael-chat-media/') || localKaelChatMediaUri(mediaRef) !== null
  )
  return kaelChatTurnImages(shownRefs, turn.media_previews)
}

export function workerV5KaelOrbMediaName(
  asset: ImagePickerAsset,
  index: number,
  language: AppLanguage,
) {
  const fileName = asset.fileName?.trim()
  if (fileName) return fileName
  return textByLanguage(language, `anh-hien-truong-${index + 1}.jpg`, `onsite-photo-${index + 1}.jpg`)
}
