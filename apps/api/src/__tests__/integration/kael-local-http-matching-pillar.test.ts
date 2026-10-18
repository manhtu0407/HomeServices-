import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { pillarPrerequisite, pillarWhy, type PillarManifest } from '../pillar-manifest'
import { createLocalQaHttpHarness, localQaRecord as record, type LocalQaActor } from './local-qa-http-harness'

export const PILLAR = {
  id: 'P394-kael-local-http-matching',
  invariant: 'real Auth Edge and PostgreSQL keep Worker proposals distinct from Customer assignment, protect address access, and persist one official-match receipt across retries',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8', 'approved Build 56 journey verification plan'],
  target: 'local public Worker proposal and Customer candidate confirmation HTTP routes',
  layer: 'integration',
  siblings: ['P123-official-match-receipt-http', 'P122-official-match-durability-sql'],
  mutation: 'replace the foreign Customer token with the owning token at the confirmation boundary; the ownership denial assertion must fail',
} as const satisfies PillarManifest

const { target, request, customer, seedRows } = createLocalQaHttpHarness(PILLAR)
const available = pillarPrerequisite(PILLAR, {
  available: target !== null,
  hint: 'Requires the named guarded local Auth Edge PostgreSQL stack; starts from a broadcast fixture and never calls a provider.',
})
const integration = available ? describe.sequential : describe.skip
const base = '/functions/v1/mobile-api'
const why = (detail?: string) => pillarWhy(PILLAR, detail)
const command = (path: string, actor: LocalQaActor, body: unknown = {}) => request(`${base}${path}`, {
  method: 'POST', token: actor.token, key: target?.anonKey, body,
})
const read = (path: string, actor: LocalQaActor) => request(`${base}${path}`, { token: actor.token, key: target?.anonKey })

integration('Matching through actual local HTTP and PostgreSQL', () => {
  for (const mode of ['inspection_only', 'rfq'] as const) {
    it(`keeps ${mode} unassigned until Customer confirmation and persists one receipt across retries`, async context => {
      const owner = await customer()
      const worker = await customer('worker')
      const foreign = await customer()
      const jobId = randomUUID()
      const sessionId = randomUUID()
      const confirmationId = randomUUID()
      const matchingId = randomUUID()
      const cohortId = `synthetic-qa-http-${randomUUID()}`
      const journey = { jobId, sessionId, confirmationId, matchingId, cohortId, ownerId: owner.id, workerId: worker.id, foreignId: foreign.id, source: 'broadcast_fixture', mode, inference: 'disabled' }
      Object.assign(context.task.meta, { qaJourney: journey })
      const now = new Date().toISOString()
      const expires = new Date(Date.parse(now) + 300_000).toISOString()
      seedRows([
        ['worker_profiles', { id: worker.id, legal_name: 'QA Matching Worker', date_of_birth: '1990-01-01',
          service_types: ['plumbing'], selected_service_types: ['plumbing'], active_service_types: ['plumbing'],
          districts: ['q7'], years_experience: 5, is_approved: true, is_available: true, verification_status: 'approved' }],
      ])
      const cohort = await request('/rest/v1/rpc/bind_synthetic_matching_cohort', { method: 'POST', body: {
        p_cohort_id: cohortId, p_customer_ids: [owner.id], p_worker_ids: [worker.id],
      } })
      expect(cohort.status, why('bind only newly generated local actors')).toBe(200)
      expect((await command('/workers/me/matching-heartbeat', worker)).status, why()).toBe(200)
      seedRows([
        ['jobs', { id: jobId, customer_id: owner.id, service_type: 'plumbing', description: 'QA isolated pipe inspection',
          address_district: 'q7', address_building: 'QA_PRIVATE_BUILDING', address_unit: 'QA_PRIVATE_UNIT',
          status: 'broadcasting', quote_mode: mode, synthetic_cohort_id: cohortId }],
        ['kael_chat_sessions', { id: sessionId, customer_id: owner.id, service_type: 'plumbing', status: 'active', case_phase: 'matching' }],
        ['confirmation_operations', { id: confirmationId, idempotency_key: `qa-matching:${sessionId}`,
          session_id: sessionId, customer_id: owner.id, job_id: jobId, quote_mode: mode,
          confirmation_kind: mode === 'rfq' ? 'rfq_request' : 'inspection_request', state: 'broadcasting', support_code: `QA${randomUUID().slice(0, 6).toUpperCase()}`, synthetic_cohort_id: cohortId }],
        ['matching_operations', { id: matchingId, confirmation_operation_id: confirmationId, job_id: jobId, state: 'broadcasting', synthetic_cohort_id: cohortId }],
        ['matching_capacity_reservations', { operation_id: confirmationId, job_id: jobId, worker_id: worker.id,
          service_type: 'plumbing', district_code: 'q7', status: 'held', held_at: now, expires_at: expires, synthetic_cohort_id: cohortId }],
      ])
      const activated = await request('/rest/v1/rpc/activate_job_broadcast_batch_durable_atomic_v2', { method: 'POST', body: {
        p_job_id: jobId, p_worker_ids: [worker.id], p_batch_id: randomUUID(), p_sent_at: now, p_expires_at: expires,
      } })
      expect(activated.status, why(`fixture activation SQL code: ${activated.status === 200 ? 'ok' : record(activated.payload).code}`)).toBe(200)
      if (!Array.isArray(activated.payload) || activated.payload.length !== 1) throw new Error(why('fixture activation did not create one delivery'))
      const broadcastId = record(activated.payload[0]).id
      const opportunities = await read('/workers/me/broadcasts', worker)
      expect(opportunities.status, why()).toBe(200)
      expect(JSON.stringify(opportunities.payload), why('opportunity must not reveal the apartment')).not.toContain('QA_PRIVATE_')
      expect(JSON.stringify(opportunities.payload), why()).toContain(String(broadcastId))
      const proposal = { scope_summary: 'Khảo sát vị trí rò nước trước khi báo giá.', ...(mode === 'rfq' ? { price_min: 300000, price_max: 500000 } : {}) }
      const proposed = await command(`/workers/me/broadcasts/${broadcastId}/proposal`, worker, proposal)
      expect(proposed.status, why('public Worker proposal must reach the actual SQL function')).toBe(201)
      const candidateId = record(proposed.payload).candidate_id
      const replayed = await command(`/workers/me/broadcasts/${broadcastId}/proposal`, worker, proposal)
      expect(replayed.status, why('lost proposal response can be replayed')).toBe(201)
      expect(record(replayed.payload), why()).toMatchObject({ candidate_id: candidateId, already_applied: true })
      expect(typeof candidateId, why()).toBe('string')
      const pending = await request(`/rest/v1/jobs?id=eq.${jobId}&select=status,worker_id,final_price`)
      expect(pending.payload, why('Worker willingness is not Customer confirmation')).toEqual([{ status: 'worker_candidate_pending', worker_id: null, final_price: null }])
      expect((await read(`/jobs/${jobId}`, worker)).status, why('no job access before the Customer gate')).toBe(404)
      const candidate = await read(`/jobs/${jobId}/candidate`, owner)
      expect(candidate.status, why('Customer must be able to render the stored proposal')).toBe(200)
      expect(record(record(candidate.payload).candidate).candidate_id, why()).toBe(candidateId)
      expect((await command(`/jobs/${jobId}/candidates/${candidateId}/confirm`, foreign)).status, why('foreign Customer cannot assign')).toBe(404)
      expect((await command(`/jobs/${jobId}/candidates/${candidateId}/confirm`, worker)).status, why('Worker cannot act as the Customer')).toBe(403)
      const confirmations = await Promise.all([command(`/jobs/${jobId}/candidates/${candidateId}/confirm`, owner), command(`/jobs/${jobId}/candidates/${candidateId}/confirm`, owner)])
      expect(confirmations.map(value => value.status), why()).toEqual([200, 200])
      expect(confirmations.map(value => record(value.payload).already_applied).sort(), why()).toEqual([false, true])
      const reopened = await read(`/jobs/${jobId}/candidates/${candidateId}/decision`, owner)
      expect(reopened.status, why()).toBe(200)
      expect(record(record(reopened.payload).receipt), why()).toMatchObject({ decision: 'confirm', worker_id: worker.id, candidate_id: candidateId })
      for (const actor of [owner, worker]) {
        const detail = await read(`/jobs/${jobId}`, actor)
        expect(detail.status, why()).toBe(200)
        expect(record(record(detail.payload).job), why()).toMatchObject({ status: 'worker_matched', final_price: null })
        expect(record(record(detail.payload).worker), why()).toMatchObject({ id: worker.id })
      }
      const events = await request(`/rest/v1/job_events?job_id=eq.${jobId}&event_type=eq.customer_confirmed_worker&select=id`)
      expect(events.payload, why('one audit event despite concurrent requests')).toHaveLength(1)
      const notices = await request(`/rest/v1/notifications?job_id=eq.${jobId}&event_type=in.(worker_matched,customer_confirmed_worker)&select=user_id,event_type`)
      expect(notices.payload, why('one notice for each participant')).toHaveLength(2)
      const health = await request(`${base}/harness/health`)
      expect(record(record(record(health.payload).release).provider_readiness).global_ai_enabled, why()).toBe(false)
      Object.assign(journey, { candidateId, broadcastId })
      for (const table of ['matching_operations', 'confirmation_operations']) {
        const operation = await request(`/rest/v1/${table}?job_id=eq.${jobId}&select=state`)
        expect(operation.payload, why('official match fences obsolete matching work')).toEqual([{ state: 'official_match' }])
      }
      const reservations = await request(`/rest/v1/matching_capacity_reservations?job_id=eq.${jobId}&status=in.(held,offered)&select=worker_id`)
      expect(reservations.payload, why('no capacity lease remains active after assignment')).toEqual([])
    }, 60_000)
  }
})
