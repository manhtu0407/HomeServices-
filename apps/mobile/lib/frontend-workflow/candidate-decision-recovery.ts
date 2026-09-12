import AsyncStorage from '@react-native-async-storage/async-storage'
import { candidateDecisionReceiptSchema } from '@nestscout/shared'
import { z } from 'zod'
import { generateClientRequestId } from '../client-request-id'

const PREFIX = 'nestscout.customer.candidate-decision.v1'
const MAX_RECORDS = 20
const writes = new Map<string, Promise<unknown>>()
const intentSchema = z.object({
  candidate_id: z.string().uuid(), worker_id: z.string().uuid(), decision: z.enum(['confirm', 'reject']),
}).strict()
const recordSchema = z.object({
  ownerId: z.string().uuid(), jobId: z.string().uuid(), localId: z.string().uuid(), intent: intentSchema,
  receipt: candidateDecisionReceiptSchema.nullable(), resolution: z.enum(['pending', 'recorded', 'superseded']),
}).strict().refine((record) => (
  (!record.receipt || (record.receipt.job_id === record.jobId
    && record.receipt.candidate_id === record.intent.candidate_id && record.receipt.worker_id === record.intent.worker_id))
  && (record.resolution !== 'pending' || record.receipt === null)
  && (record.resolution !== 'recorded' || record.receipt?.decision === record.intent.decision)
))
export type CandidateDecisionIntent = z.infer<typeof intentSchema>
export type PendingCandidateDecision = z.infer<typeof recordSchema>

export function sameCandidateDecision(left: CandidateDecisionIntent, right: CandidateDecisionIntent) {
  return left.candidate_id === right.candidate_id && left.worker_id === right.worker_id && left.decision === right.decision
}

export async function listCandidateDecisions(ownerId: string) {
  await writes.get(ownerId)?.catch(() => undefined)
  return readRecords(ownerId)
}

export function prepareCandidateDecision(ownerId: string, jobId: string, intent: CandidateDecisionIntent, current: () => boolean) {
  return serialize(ownerId, async () => {
    const records = await readRecords(ownerId)
    if (!current()) return null
    const prior = records.find((entry) => entry.jobId === jobId)
    if (prior && (prior.resolution === 'pending' || prior.intent.candidate_id === intent.candidate_id)) {
      if (!sameCandidateDecision(prior.intent, intent)) throw new Error('CANDIDATE_DECISION_CONFLICT')
      return prior
    }
    const record = recordSchema.parse({ ownerId, jobId, intent, localId: generateClientRequestId(), receipt: null, resolution: 'pending' })
    let retained = records.filter((entry) => entry.jobId !== jobId)
    if (retained.length >= MAX_RECORDS) retained = retained.filter((entry) => entry.resolution === 'pending')
    // Storage pressure cannot erase an unresolved Customer decision.
    if (retained.length >= MAX_RECORDS) throw new Error('CANDIDATE_STORAGE_UNAVAILABLE')
    await AsyncStorage.setItem(`${PREFIX}.${ownerId}`, JSON.stringify([...retained, record]))
    return record
  })
}

export function storeCandidateDecision(record: PendingCandidateDecision, current: () => boolean) {
  return serialize(record.ownerId, async () => {
    const valid = recordSchema.parse(record)
    const records = await readRecords(record.ownerId)
    if (!current()) return false
    const index = records.findIndex((entry) => entry.jobId === record.jobId)
    if (index < 0 || records[index].localId !== record.localId) return false
    if (!sameCandidateDecision(records[index].intent, valid.intent)) return false
    if (records[index].resolution !== 'pending' && JSON.stringify(records[index]) !== JSON.stringify(valid)) return false
    records[index] = valid
    await AsyncStorage.setItem(`${PREFIX}.${record.ownerId}`, JSON.stringify(records))
    return true
  })
}

async function readRecords(ownerId: string): Promise<PendingCandidateDecision[]> {
  z.string().uuid().parse(ownerId)
  const raw = await AsyncStorage.getItem(`${PREFIX}.${ownerId}`)
  if (raw === null) return []
  const records = z.array(recordSchema).max(MAX_RECORDS).parse(JSON.parse(raw))
  if (records.some((entry) => entry.ownerId !== ownerId) || new Set(records.map((entry) => entry.jobId)).size !== records.length) {
    throw new Error('CANDIDATE_STORAGE_UNAVAILABLE')
  }
  return records
}

async function serialize<T>(ownerId: string, work: () => Promise<T>): Promise<T> {
  const request = (writes.get(ownerId) ?? Promise.resolve()).catch(() => undefined).then(work)
  writes.set(ownerId, request)
  try { return await request } finally { if (writes.get(ownerId) === request) writes.delete(ownerId) }
}
