import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ConfirmationOperationReceipt } from '@nestscout/shared'

import { generateClientRequestId } from '../client-request-id'

const STORAGE_PREFIX = 'nestscout.customer.confirmation-recovery.v1'

export type PendingConfirmationRecovery = {
  idempotencyKey: string
  operation: ConfirmationOperationReceipt | null
  sessionId: string
  supportCode: string | null
  updatedAt: string
}

export async function getOrCreatePendingConfirmation(sessionId: string) {
  const existing = await readPendingConfirmation(sessionId)
  if (existing) return existing
  const created: PendingConfirmationRecovery = {
    idempotencyKey: `confirm:${generateClientRequestId()}`,
    operation: null,
    sessionId,
    supportCode: null,
    updatedAt: new Date().toISOString(),
  }
  await writePendingConfirmation(created)
  return created
}

export async function readPendingConfirmation(sessionId: string) {
  const raw = await AsyncStorage.getItem(storageKey(sessionId)).catch(() => null)
  if (!raw) return null
  try {
    return parsePendingConfirmation(JSON.parse(raw), sessionId)
  } catch {
    await clearPendingConfirmation(sessionId)
    return null
  }
}

export async function writePendingConfirmation(value: PendingConfirmationRecovery) {
  await AsyncStorage.setItem(storageKey(value.sessionId), JSON.stringify(value)).catch(() => undefined)
}

export async function clearPendingConfirmation(sessionId: string) {
  await AsyncStorage.removeItem(storageKey(sessionId)).catch(() => undefined)
}

function parsePendingConfirmation(value: unknown, sessionId: string): PendingConfirmationRecovery | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<PendingConfirmationRecovery>
  if (
    record.sessionId !== sessionId
    || typeof record.idempotencyKey !== 'string'
    || record.idempotencyKey.length < 16
    || typeof record.updatedAt !== 'string'
  ) return null
  return {
    idempotencyKey: record.idempotencyKey,
    operation: record.operation ?? null,
    sessionId,
    supportCode: typeof record.supportCode === 'string' && /^[A-Z0-9]{8}$/.test(record.supportCode)
      ? record.supportCode
      : null,
    updatedAt: record.updatedAt,
  }
}

function storageKey(sessionId: string) {
  return `${STORAGE_PREFIX}.${encodeURIComponent(sessionId)}`
}
