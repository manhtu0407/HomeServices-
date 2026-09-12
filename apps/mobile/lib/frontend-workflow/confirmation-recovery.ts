import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  confirmationOperationReceiptSchema,
  kaelChatConfirmSchema,
  type ConfirmationOperationReceipt,
  type KaelChatConfirmInput,
} from '@nestscout/shared'

import { generateClientRequestId } from '../client-request-id'

const STORAGE_PREFIX = 'nestscout.customer.confirmation-recovery.v2'
const LEGACY_STORAGE_PREFIX = 'nestscout.customer.confirmation-recovery.v1'
const MAX_PENDING_CONFIRMATIONS = 20
const pendingWrites = new Map<string, Promise<unknown>>()

type StoredPendingConfirmationEnvelope = {
  ownerId: string
  records: PendingConfirmationRecovery[]
  version: 2
}

export type PendingConfirmationRecovery = {
  confirmInput: KaelChatConfirmInput | null
  idempotencyKey: string
  operation: ConfirmationOperationReceipt | null
  ownerId: string
  sessionId: string
  supportCode: string | null
  updatedAt: string
}

export async function getOrCreatePendingConfirmation(
  ownerId: string,
  sessionId: string,
  confirmInput: KaelChatConfirmInput,
) {
  const input = kaelChatConfirmSchema.parse(confirmInput)
  return queueOwnerWrite(ownerId, async () => {
    const records = await readOwnerRecords(ownerId)
    const existing = records.find((record) => record.sessionId === sessionId) ?? await readLegacyConfirmation(ownerId, sessionId)
    if (existing?.confirmInput && JSON.stringify(existing.confirmInput) !== JSON.stringify(input)) {
      throw new Error('CONFIRMATION_RECOVERY_INTENT_CONFLICT')
    }
    const created: PendingConfirmationRecovery = existing ? {
      ...existing, confirmInput: existing.confirmInput ?? input,
    } : {
      confirmInput: input, idempotencyKey: `confirm:${generateClientRequestId()}`, operation: null,
      ownerId, sessionId, supportCode: null, updatedAt: new Date().toISOString(),
    }
    await persistOwnerRecord(records, created)
    return created
  })
}

export async function listPendingConfirmations(ownerId: string) {
  if (!validIdentifier(ownerId)) return []
  await pendingWrites.get(ownerId)?.catch(() => undefined)
  return readOwnerRecords(ownerId)
}

export async function readPendingConfirmation(ownerId: string, sessionId: string) {
  if (!validIdentifier(ownerId) || !validIdentifier(sessionId)) return null
  return queueOwnerWrite(ownerId, async () => {
    const records = await readOwnerRecords(ownerId)
    const current = records.find((record) => record.sessionId === sessionId)
    if (current) return current
    const migrated = await readLegacyConfirmation(ownerId, sessionId)
    if (migrated) await persistOwnerRecord(records, migrated)
    return migrated
  })
}

export async function writePendingConfirmation(value: PendingConfirmationRecovery) {
  await queueOwnerWrite(value.ownerId, async () => {
    const records = await readOwnerRecords(value.ownerId)
    await persistOwnerRecord(records, value)
  })
}

async function persistOwnerRecord(records: PendingConfirmationRecovery[], value: PendingConfirmationRecovery) {
  const parsed = parsePendingConfirmation(value, value.ownerId, value.sessionId)
  if (!parsed) throw new Error('CONFIRMATION_RECOVERY_RECORD_INVALID')
  const prior = records.find((record) => record.sessionId === value.sessionId)
  if (prior && (prior.idempotencyKey !== parsed.idempotencyKey
    || (prior.confirmInput && JSON.stringify(prior.confirmInput) !== JSON.stringify(parsed.confirmInput))
    || (prior.operation && (!parsed.operation || prior.operation.operation_id !== parsed.operation.operation_id
      || prior.operation.idempotency_key !== parsed.operation.idempotency_key
      || (prior.operation.job_id && prior.operation.job_id !== parsed.operation.job_id))))) {
    throw new Error('CONFIRMATION_RECOVERY_IDENTITY_CONFLICT')
  }
  const next = [parsed, ...records.filter((record) => record.sessionId !== parsed.sessionId)]
  if (next.length > MAX_PENDING_CONFIRMATIONS) throw new Error('CONFIRMATION_RECOVERY_STORAGE_FULL')
  await AsyncStorage.setItem(storageKey(value.ownerId), JSON.stringify({ ownerId: value.ownerId, records: next, version: 2 } satisfies StoredPendingConfirmationEnvelope))
  await removeOwnedLegacyRecord(value.ownerId, value.sessionId)
}

export async function clearPendingConfirmation(ownerId: string, sessionId: string) {
  if (!validIdentifier(ownerId) || !validIdentifier(sessionId)) return
  await queueOwnerWrite(ownerId, async () => {
    const records = await readOwnerRecords(ownerId)
    const next = records.filter((record) => record.sessionId !== sessionId)
    if (next.length === 0) {
      await AsyncStorage.removeItem(storageKey(ownerId))
    } else {
      await AsyncStorage.setItem(storageKey(ownerId), JSON.stringify({
        ownerId,
        records: next,
        version: 2,
      } satisfies StoredPendingConfirmationEnvelope))
    }
    await removeOwnedLegacyRecord(ownerId, sessionId)
  })
}

async function readOwnerRecords(ownerId: string): Promise<PendingConfirmationRecovery[]> {
  const raw = await AsyncStorage.getItem(storageKey(ownerId))
  if (raw === null) return []
  try {
    const value = JSON.parse(raw) as Partial<StoredPendingConfirmationEnvelope>
    if (value.version !== 2 || value.ownerId !== ownerId || !Array.isArray(value.records) || value.records.length > MAX_PENDING_CONFIRMATIONS) {
      throw new Error('CONFIRMATION_RECOVERY_RECORD_INVALID')
    }
    const records = value.records.map((record) => parsePendingConfirmation(record, ownerId))
    if (records.some((record) => !record) || new Set(records.map((record) => record?.sessionId)).size !== records.length) {
      throw new Error('CONFIRMATION_RECOVERY_RECORD_INVALID')
    }
    return records as PendingConfirmationRecovery[]
  } catch {
    throw new Error('CONFIRMATION_RECOVERY_RECORD_INVALID')
  }
}

async function readLegacyConfirmation(ownerId: string, sessionId: string) {
  const raw = await AsyncStorage.getItem(legacyStorageKey(sessionId))
  if (raw === null) return null
  const migrated = parsePendingConfirmation(JSON.parse(raw), ownerId, sessionId)
  // A session-only record is not proof that the currently signed-in actor gave consent.
  if (!migrated) throw new Error('CONFIRMATION_RECOVERY_LEGACY_OWNER_UNVERIFIED')
  return migrated
}

async function removeOwnedLegacyRecord(ownerId: string, sessionId: string) {
  try {
    const raw = await AsyncStorage.getItem(legacyStorageKey(sessionId))
    if (raw !== null && JSON.parse(raw)?.ownerId === ownerId) await AsyncStorage.removeItem(legacyStorageKey(sessionId))
  } catch { /* The v2 receipt is already durable; an unreadable legacy alias must be preserved. */ }
}

function parsePendingConfirmation(
  value: unknown,
  ownerId: string,
  expectedSessionId?: string,
): PendingConfirmationRecovery | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<PendingConfirmationRecovery>
  const sessionId = expectedSessionId ?? record.sessionId
  if (
    !validIdentifier(ownerId)
    || !validIdentifier(sessionId)
    || record.sessionId !== sessionId
    || record.ownerId !== ownerId
    || typeof record.idempotencyKey !== 'string'
    || record.idempotencyKey.length < 16
    || typeof record.updatedAt !== 'string'
    || Number.isNaN(Date.parse(record.updatedAt))
  ) return null
  const confirmInput = record.confirmInput === null || record.confirmInput === undefined
    ? null
    : kaelChatConfirmSchema.safeParse(record.confirmInput)
  if (confirmInput && 'success' in confirmInput && !confirmInput.success) return null
  const operation = record.operation === null || record.operation === undefined
    ? null
    : confirmationOperationReceiptSchema.safeParse(record.operation)
  if (operation && 'success' in operation && !operation.success) return null
  if (operation?.success && operation.data.session_id !== sessionId) return null
  return {
    confirmInput: confirmInput && 'success' in confirmInput ? confirmInput.data : null,
    idempotencyKey: record.idempotencyKey,
    operation: operation && 'success' in operation ? operation.data : null,
    ownerId,
    sessionId,
    supportCode: typeof record.supportCode === 'string' && /^[A-Z0-9]{8}$/.test(record.supportCode)
      ? record.supportCode
      : null,
    updatedAt: record.updatedAt,
  }
}

async function queueOwnerWrite<T>(ownerId: string, write: () => Promise<T>): Promise<T> {
  const previous = pendingWrites.get(ownerId) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(write)
  pendingWrites.set(ownerId, current)
  try {
    return await current
  } finally {
    if (pendingWrites.get(ownerId) === current) pendingWrites.delete(ownerId)
  }
}

function storageKey(ownerId: string) {
  return `${STORAGE_PREFIX}.${encodeURIComponent(ownerId)}`
}

function legacyStorageKey(sessionId: string) {
  return `${LEGACY_STORAGE_PREFIX}.${encodeURIComponent(sessionId)}`
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160
}
