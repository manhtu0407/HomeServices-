import AsyncStorage from '@react-native-async-storage/async-storage'
import { jobMatchingPreferenceSchema, matchingSelectionReceiptSchema, type JobMatchingPreferenceInput } from '@nestscout/shared'
import { z } from 'zod'
import { generateClientRequestId } from '../client-request-id'

const PREFIX = 'nestscout.customer.matching-selection.v1'
const MAX_RECORDS = 20
const writes = new Map<string, Promise<unknown>>()
export const MATCHING_SELECTION_REJECTIONS = [
  'COVERAGE_UNAVAILABLE', 'MATCHING_PREFERENCE_NOT_READY', 'MATCHING_PREFERENCE_FAVORITE_UNAVAILABLE',
  'MATCHING_PREFERENCE_REQUEST_CONFLICT', 'MATCHING_PREFERENCE_CONFIRMATION_UNAVAILABLE',
] as const
const pendingSchema = z.object({
  ownerId: z.string().uuid(), jobId: z.string().uuid(), request: jobMatchingPreferenceSchema,
  receipt: matchingSelectionReceiptSchema.nullable(), rejectedCode: z.enum(MATCHING_SELECTION_REJECTIONS).nullable(),
}).strict().refine(({ jobId, request, receipt }) => !receipt || (
  receipt.job_id === jobId && receipt.request_id === request.client_request_id
  && receipt.mode === request.mode && receipt.preferred_worker_id === (request.worker_id ?? null)
  && receipt.auto_general === request.auto_general
))
export type PendingMatchingSelection = z.infer<typeof pendingSchema>

export function isMatchingSelectionTerminal(receipt: PendingMatchingSelection['receipt']) {
  return receipt !== null && ['official_match', 'no_reachable_worker', 'stopped'].includes(receipt.state)
}

export function matchingChoiceKey(input: Omit<JobMatchingPreferenceInput, 'client_request_id'>) {
  return JSON.stringify([input.mode, input.worker_id ?? null, input.auto_general ?? false])
}

export async function listMatchingSelections(ownerId: string): Promise<PendingMatchingSelection[]> {
  await writes.get(ownerId)?.catch(() => undefined)
  return readRecords(ownerId)
}

export function prepareMatchingSelection(ownerId: string, jobId: string, input: Omit<JobMatchingPreferenceInput, 'client_request_id'>) {
  return serialize(ownerId, async () => {
    const records = await readRecords(ownerId)
    const existing = records.find((record) => record.jobId === jobId)
    const same = existing && matchingChoiceKey(existing.request) === matchingChoiceKey(input)
    if (existing && !same && (!existing.rejectedCode || existing.receipt
      || existing.rejectedCode === 'MATCHING_PREFERENCE_REQUEST_CONFLICT')) {
      throw new Error('MATCHING_PREFERENCE_REQUEST_CONFLICT')
    }
    const created = pendingSchema.parse(same ? { ...existing, rejectedCode: null } : {
      ownerId, jobId, request: { ...input, client_request_id: generateClientRequestId() }, receipt: null, rejectedCode: null,
    })
    let retained = records.filter((record) => record.jobId !== jobId)
    if (retained.length >= MAX_RECORDS) retained = retained.filter((record) => !isMatchingSelectionTerminal(record.receipt) && !record.rejectedCode)
    // Never discard an unknown command to make room for a new one.
    if (retained.length >= MAX_RECORDS) throw new Error('MATCHING_PREFERENCE_STORAGE_UNAVAILABLE')
    await AsyncStorage.setItem(`${PREFIX}.${ownerId}`, JSON.stringify([...retained, created]))
    return created
  })
}

export function storeMatchingSelection(record: PendingMatchingSelection) {
  return serialize(record.ownerId, async () => {
    const valid = pendingSchema.parse(record)
    const records = await readRecords(record.ownerId)
    const index = records.findIndex((entry) => entry.jobId === record.jobId)
    if (index < 0 || records[index].request.client_request_id !== record.request.client_request_id) return false
    const prior = records[index].receipt
    if (prior && valid.receipt && (prior.operation_id !== valid.receipt.operation_id
      || prior.confirmation_operation_id !== valid.receipt.confirmation_operation_id
      || prior.selected_at !== valid.receipt.selected_at)) return false
    records[index] = valid
    await AsyncStorage.setItem(`${PREFIX}.${record.ownerId}`, JSON.stringify(records))
    return true
  })
}

async function readRecords(ownerId: string): Promise<PendingMatchingSelection[]> {
  const raw = await AsyncStorage.getItem(`${PREFIX}.${ownerId}`)
  if (raw === null) return []
  z.string().uuid().parse(ownerId)
  const records = z.array(pendingSchema).max(MAX_RECORDS).parse(JSON.parse(raw))
  if (records.some((record) => record.ownerId !== ownerId)
    || new Set(records.map((record) => record.jobId)).size !== records.length) throw new Error('MATCHING_PREFERENCE_STORAGE_UNAVAILABLE')
  return records
}

async function serialize<T>(ownerId: string, work: () => Promise<T>): Promise<T> {
  const current = (writes.get(ownerId) ?? Promise.resolve()).catch(() => undefined).then(work)
  writes.set(ownerId, current)
  try { return await current } finally { if (writes.get(ownerId) === current) writes.delete(ownerId) }
}
