export const PENDING_KAEL_CHAT_MESSAGE_TTL_MS = 5 * 60 * 1000
export const PENDING_KAEL_CHAT_MESSAGE_MAX_LENGTH = 2000

type PendingKaelChatMessageEnvelope = {
  message: string
  ownerId: string
  savedAt: number
  version: 1
}

let pendingKaelChatMessageEnvelope: PendingKaelChatMessageEnvelope | null = null

function normalizeOwnerId(ownerId: string | null | undefined) {
  if (typeof ownerId !== 'string') return null
  const normalizedOwnerId = ownerId.trim()
  return normalizedOwnerId.length > 0 ? normalizedOwnerId : null
}

function isFresh(envelope: PendingKaelChatMessageEnvelope, now = Date.now()) {
  return envelope.savedAt <= now && now - envelope.savedAt < PENDING_KAEL_CHAT_MESSAGE_TTL_MS
}

function invalidatePendingMessage() {
  pendingKaelChatMessageEnvelope = null
}

export function stagePendingKaelChatMessage(ownerId: string | null | undefined, message: string) {
  const normalizedOwnerId = normalizeOwnerId(ownerId)
  const normalizedMessage = typeof message === 'string' ? message.trim() : ''
  if (
    !normalizedOwnerId ||
    normalizedMessage.length === 0 ||
    normalizedMessage.length > PENDING_KAEL_CHAT_MESSAGE_MAX_LENGTH
  ) return false

  const envelope: PendingKaelChatMessageEnvelope = {
    message: normalizedMessage,
    ownerId: normalizedOwnerId,
    savedAt: Date.now(),
    version: 1,
  }
  pendingKaelChatMessageEnvelope = envelope
  return true
}

export function peekPendingKaelChatMessage(ownerId: string | null | undefined) {
  const normalizedOwnerId = normalizeOwnerId(ownerId)
  const envelope = pendingKaelChatMessageEnvelope
  if (!normalizedOwnerId || !envelope) return null
  if (envelope.ownerId !== normalizedOwnerId || !isFresh(envelope)) {
    invalidatePendingMessage()
    return null
  }
  return envelope.message
}

export function takePendingKaelChatMessage(ownerId: string | null | undefined) {
  const message = peekPendingKaelChatMessage(ownerId)
  if (!message) return null
  pendingKaelChatMessageEnvelope = null
  return message
}

export function clearPendingKaelChatMessage(ownerId: string | null | undefined) {
  const normalizedOwnerId = normalizeOwnerId(ownerId)
  if (normalizedOwnerId && pendingKaelChatMessageEnvelope?.ownerId !== normalizedOwnerId) return
  invalidatePendingMessage()
}
