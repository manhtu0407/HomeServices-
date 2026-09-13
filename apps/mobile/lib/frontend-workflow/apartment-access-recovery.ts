import AsyncStorage from '@react-native-async-storage/async-storage'
import { apartmentAccessAuthorizationSchema, apartmentAccessAuthorizationReceiptSchema, type ApartmentAccessAuthorizationInput } from '@nestscout/shared'
import { z } from 'zod'
import { generateClientRequestId } from '../client-request-id'

const PREFIX = 'nestscout.customer.apartment-access.v1'
const MAX_RECORDS = 20
const writes = new Map<string, Promise<unknown>>()
const pendingSchema = z.object({
  ownerId: z.string().uuid(), jobId: z.string().uuid(), localId: z.string().uuid(),
  intent: apartmentAccessAuthorizationSchema,
  receipt: apartmentAccessAuthorizationReceiptSchema.nullable(),
  resolution: z.enum(['pending', 'confirmed', 'superseded', 'rejected']),
}).strict().refine((record) => (!record.receipt || (
  record.receipt.job_id === record.jobId && record.receipt.worker_id === record.intent.expected_worker_id
  && record.receipt.checked_in_at === record.intent.expected_check_in_at
)) && (record.resolution === 'confirmed') === Boolean(record.receipt))
export type PendingApartmentAccess = z.infer<typeof pendingSchema>

export function sameApartmentIntent(left: ApartmentAccessAuthorizationInput, right: ApartmentAccessAuthorizationInput) {
  return left.expected_worker_id === right.expected_worker_id && left.expected_check_in_at === right.expected_check_in_at
}

export async function listApartmentAccess(ownerId: string): Promise<PendingApartmentAccess[]> {
  await writes.get(ownerId)?.catch(() => undefined)
  return readRecords(ownerId)
}

export function prepareApartmentAccess(ownerId: string, jobId: string, intent: ApartmentAccessAuthorizationInput, current: () => boolean) {
  return serialize(ownerId, async () => {
    const records = await readRecords(ownerId)
    if (!current()) return null
    const prior = records.find((record) => record.jobId === jobId)
    if (prior?.resolution === 'pending') {
      if (!sameApartmentIntent(prior.intent, intent)) throw new Error('ACCESS_CONTEXT_CHANGED')
      return prior
    }
    const record = pendingSchema.parse({ ownerId, jobId, intent, localId: generateClientRequestId(), receipt: null, resolution: 'pending' })
    let retained = records.filter((entry) => entry.jobId !== jobId)
    if (retained.length >= MAX_RECORDS) retained = retained.filter((entry) => entry.resolution === 'pending')
    // Unknown commands must survive storage pressure; never evict unresolved consent.
    if (retained.length >= MAX_RECORDS) throw new Error('ACCESS_STORAGE_UNAVAILABLE')
    await AsyncStorage.setItem(`${PREFIX}.${ownerId}`, JSON.stringify([...retained, record]))
    return record
  })
}

export function storeApartmentAccess(record: PendingApartmentAccess, current: () => boolean) {
  return serialize(record.ownerId, async () => {
    const valid = pendingSchema.parse(record)
    const records = await readRecords(record.ownerId)
    if (!current()) return false
    const index = records.findIndex((entry) => entry.jobId === record.jobId)
    if (index < 0 || records[index].localId !== record.localId) return false
    const prior = records[index]
    if (prior.resolution !== 'pending' && JSON.stringify(prior) !== JSON.stringify(valid)) return false
    records[index] = valid
    await AsyncStorage.setItem(`${PREFIX}.${record.ownerId}`, JSON.stringify(records))
    return true
  })
}

async function readRecords(ownerId: string): Promise<PendingApartmentAccess[]> {
  z.string().uuid().parse(ownerId)
  const raw = await AsyncStorage.getItem(`${PREFIX}.${ownerId}`)
  if (raw === null) return []
  const records = z.array(pendingSchema).max(MAX_RECORDS).parse(JSON.parse(raw))
  if (records.some((entry) => entry.ownerId !== ownerId) || new Set(records.map((entry) => entry.jobId)).size !== records.length) {
    throw new Error('ACCESS_STORAGE_UNAVAILABLE')
  }
  return records
}

async function serialize<T>(ownerId: string, work: () => Promise<T>): Promise<T> {
  const request = (writes.get(ownerId) ?? Promise.resolve()).catch(() => undefined).then(work)
  writes.set(ownerId, request)
  try { return await request } finally { if (writes.get(ownerId) === request) writes.delete(ownerId) }
}
