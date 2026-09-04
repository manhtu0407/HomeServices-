import type { WorkerKaelChatMode } from '@nestscout/shared'

export const PENDING_WORKER_KAEL_DRAFT_TTL_MS = 5 * 60 * 1000
export const PENDING_WORKER_KAEL_DRAFT_MAX_LENGTH = 1_200

export type PendingWorkerKaelDraftScope = 'job' | 'normal' | 'opportunity'

export type PendingWorkerKaelDraft = {
  message: string
  mode: WorkerKaelChatMode
  scope: PendingWorkerKaelDraftScope
}

type PendingWorkerKaelDraftEnvelope = PendingWorkerKaelDraft & {
  ownerId: string
  savedAt: number
  version: 1
}

let pendingWorkerKaelDraftEnvelope: PendingWorkerKaelDraftEnvelope | null = null

function normalizedOwnerId(ownerId: string | null | undefined) {
  if (typeof ownerId !== 'string') return null
  const normalized = ownerId.trim()
  return normalized.length > 0 ? normalized : null
}

function validScopeForMode(mode: WorkerKaelChatMode, scope: PendingWorkerKaelDraftScope) {
  return mode === 'normal' ? scope === 'normal' : scope === 'job' || scope === 'opportunity'
}

function isFresh(envelope: PendingWorkerKaelDraftEnvelope, now: number) {
  return envelope.savedAt <= now && now - envelope.savedAt < PENDING_WORKER_KAEL_DRAFT_TTL_MS
}

function copyDraft(envelope: PendingWorkerKaelDraftEnvelope): PendingWorkerKaelDraft {
  return {
    message: envelope.message,
    mode: envelope.mode,
    scope: envelope.scope,
  }
}

export function stagePendingWorkerKaelDraft(
  ownerId: string | null | undefined,
  draft: PendingWorkerKaelDraft,
  now = Date.now(),
) {
  const owner = normalizedOwnerId(ownerId)
  const message = typeof draft.message === 'string' ? draft.message.trim() : ''
  if (
    !owner
    || message.length === 0
    || message.length > PENDING_WORKER_KAEL_DRAFT_MAX_LENGTH
    || !validScopeForMode(draft.mode, draft.scope)
    || !Number.isFinite(now)
  ) return false

  pendingWorkerKaelDraftEnvelope = {
    message,
    mode: draft.mode,
    ownerId: owner,
    savedAt: now,
    scope: draft.scope,
    version: 1,
  }
  return true
}

export function peekPendingWorkerKaelDraft(
  ownerId: string | null | undefined,
  mode: WorkerKaelChatMode,
  scope: PendingWorkerKaelDraftScope,
  now = Date.now(),
) {
  const owner = normalizedOwnerId(ownerId)
  const envelope = pendingWorkerKaelDraftEnvelope
  if (!owner || !envelope) return null
  if (!isFresh(envelope, now)) {
    pendingWorkerKaelDraftEnvelope = null
    return null
  }
  if (envelope.ownerId !== owner || envelope.mode !== mode || envelope.scope !== scope) return null
  return copyDraft(envelope)
}

export function takePendingWorkerKaelDraft(
  ownerId: string | null | undefined,
  mode: WorkerKaelChatMode,
  scope: PendingWorkerKaelDraftScope,
  now = Date.now(),
) {
  const draft = peekPendingWorkerKaelDraft(ownerId, mode, scope, now)
  if (!draft) return null
  pendingWorkerKaelDraftEnvelope = null
  return draft
}

export function clearPendingWorkerKaelDraft(ownerId?: string | null) {
  const owner = normalizedOwnerId(ownerId)
  if (owner && pendingWorkerKaelDraftEnvelope?.ownerId !== owner) return
  pendingWorkerKaelDraftEnvelope = null
}
