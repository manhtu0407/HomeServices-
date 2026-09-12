import AsyncStorage from '@react-native-async-storage/async-storage'
import { matchingRetryReceiptSchema, matchingRetryRequestSchema, type MatchingRetryReceipt } from '@nestscout/shared'
import { z } from 'zod'
import { generateClientRequestId } from '../client-request-id'

const PREFIX = 'nestscout.customer.matching-retry.v1'
const MAX_RECORDS = 20
const writes = new Map<string, Promise<unknown>>()
export const MATCHING_RETRY_REJECTIONS = [
  'COVERAGE_UNAVAILABLE', 'MATCHING_RETRY_PARENT_CHANGED', 'MATCHING_RETRY_NOT_READY',
  'MATCHING_RETRY_REQUEST_CONFLICT', 'MATCHING_RETRY_CONFIRMATION_UNAVAILABLE', 'MATCHING_PREFERENCE_PENDING',
] as const

const pendingSchema = z.object({
  ownerId: z.string().uuid(), jobId: z.string().uuid(), request: matchingRetryRequestSchema,
  receipt: matchingRetryReceiptSchema.nullable(), rejectedCode: z.enum(MATCHING_RETRY_REJECTIONS).nullable(),
}).strict().refine((record) => !record.receipt || (
  record.receipt.job_id === record.jobId
  && record.receipt.request_id === record.request.client_request_id
  && record.receipt.parent_operation_id === record.request.expected_matching_operation_id
))
export type PendingMatchingRetry = z.infer<typeof pendingSchema>

export function isMatchingRetryTerminal(receipt: MatchingRetryReceipt | null) {
  return receipt !== null && ['official_match', 'no_reachable_worker', 'stopped'].includes(receipt.state)
}

export async function listMatchingRetries(ownerId: string): Promise<PendingMatchingRetry[]> {
  await writes.get(ownerId)?.catch(() => undefined)
  return readRecords(ownerId)
}

export function prepareMatchingRetry(ownerId: string, jobId: string, parentId: string) {
  return serialize(ownerId, async () => {
    const records = await readRecords(ownerId)
    const existing = records.find((record) => record.jobId === jobId)
    // A newer explicit Customer retry may replace only a proven exhausted operation.
    const advances = existing?.receipt?.state === 'no_reachable_worker'
      && existing.receipt.operation_id === parentId
    if (existing && !advances) {
      if (!existing.rejectedCode) return existing
      const resumed = { ...existing, rejectedCode: null }
      await saveRecords(ownerId, records.map((record) => record === existing ? resumed : record))
      return resumed
    }
    const created = pendingSchema.parse({
      ownerId, jobId, request: { client_request_id: generateClientRequestId(), expected_matching_operation_id: parentId },
      receipt: null, rejectedCode: null,
    })
    let retained = records.filter((record) => record.jobId !== jobId)
    if (retained.length >= MAX_RECORDS) {
      retained = retained.filter((record) => !isMatchingRetryTerminal(record.receipt) && !record.rejectedCode)
    }
    if (retained.length >= MAX_RECORDS) throw new Error('MATCHING_RETRY_STORAGE_FULL')
    await saveRecords(ownerId, [...retained, created])
    return created
  })
}

export function storeMatchingRetry(record: PendingMatchingRetry) {
  return serialize(record.ownerId, async () => {
    const valid = pendingSchema.parse(record)
    const records = await readRecords(record.ownerId)
    const index = records.findIndex((entry) => entry.jobId === record.jobId)
    if (index < 0 || records[index].request.client_request_id !== record.request.client_request_id) return false
    records[index] = valid
    await saveRecords(record.ownerId, records)
    return true
  })
}

async function readRecords(ownerId: string): Promise<PendingMatchingRetry[]> {
  const raw = await AsyncStorage.getItem(`${PREFIX}.${ownerId}`)
  if (raw === null) return []
  z.string().uuid().parse(ownerId)
  // A failed/corrupt read must not masquerade as an empty queue and create a new command.
  const records = z.array(pendingSchema).max(MAX_RECORDS).parse(JSON.parse(raw))
  if (records.some((record) => record.ownerId !== ownerId)
    || new Set(records.map((record) => record.jobId)).size !== records.length) {
    throw new Error('MATCHING_RETRY_STORAGE_INVALID')
  }
  return records
}

async function saveRecords(ownerId: string, records: PendingMatchingRetry[]) {
  await AsyncStorage.setItem(`${PREFIX}.${ownerId}`, JSON.stringify(records))
}

async function serialize<T>(ownerId: string, work: () => Promise<T>): Promise<T> {
  const current = (writes.get(ownerId) ?? Promise.resolve()).catch(() => undefined).then(work)
  writes.set(ownerId, current)
  try { return await current } finally {
    if (writes.get(ownerId) === current) writes.delete(ownerId)
  }
}
