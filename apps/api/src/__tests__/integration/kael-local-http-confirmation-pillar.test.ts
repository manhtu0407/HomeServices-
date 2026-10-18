import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { pillarPrerequisite, pillarWhy, type PillarManifest } from '../pillar-manifest'
import { createLocalQaHttpHarness, localQaRecord as record, type LocalQaActor } from './local-qa-http-harness'

export const PILLAR = {
  id: 'P395-kael-local-http-confirmation',
  invariant: 'real local Auth Edge and PostgreSQL preserve one RFQ confirmation through the actual matching dispatcher and require owning Customer consent before Worker assignment',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8', 'approved Build 56 journey verification plan'],
  target: 'POST mobile-api/kael/chat/:id/confirm with a saved RFQ intake artifact',
  layer: 'integration',
  siblings: ['P391-kael-local-http-intake', 'P394-kael-local-http-matching', 'P48-durable-confirmation-operation'],
  mutation: 'remove the exact ownership failure mapping; the public foreign-Customer denial must become500 instead of404',
} as const satisfies PillarManifest

const { target, request, customer, seedRows, confirmationFailureCount, dispatchMatching } = createLocalQaHttpHarness(PILLAR)
const integration = pillarPrerequisite(PILLAR, {
  available: target !== null,
  hint: 'Requires the named guarded local stack; saved diagnosis is a fixture and no AI inference is allowed.',
}) ? describe.sequential : describe.skip
const base = '/functions/v1/mobile-api'
const why = (detail?: string) => pillarWhy(PILLAR, detail)
const confirm = (id: string, actor: LocalQaActor) => request(`${base}/kael/chat/${id}/confirm`, {
  method: 'POST', token: actor.token, key: target?.anonKey, body: { confirmation_kind: 'rfq_request' },
})

integration('Initial offer confirmation through actual local HTTP and PostgreSQL', () => {
  it('creates one job and operation after explicit Customer consent, despite concurrent requests and a lost response', async context => {
    const owner = await customer()
    const foreign = await customer()
    const worker = await customer('worker')
    const sessionId = randomUUID()
    const cohortId = `synthetic-qa-confirm-${randomUUID()}`
    const journey = { sessionId, cohortId, ownerId: owner.id, workerId: worker.id, foreignId: foreign.id, source: 'saved_rfq_intake_fixture' }
    Object.assign(context.task.meta, { qaJourney: journey })
    const problems = await request('/rest/v1/service_problems?service_type=eq.plumbing&slug=eq.plumbing-general&select=id')
    expect(problems.status, why()).toBe(200)
    expect(problems.payload, why()).toHaveLength(1)
    if (!Array.isArray(problems.payload)) throw new Error(why('local service catalog absent'))
    const problemId = record(problems.payload[0]).id
    const policy = await request(`/rest/v1/service_intake_policies?service_problem_id=eq.${problemId}&status=eq.active&select=quote_mode&order=version.desc&limit=1`)
    expect(policy.payload, why('use the existing policy without changing pricing or training data')).toEqual([{ quote_mode: 'rfq' }])
    seedRows([
      ['worker_profiles', { id: worker.id, legal_name: 'QA Consent Worker', date_of_birth: '1990-01-01',
        service_types: ['plumbing'], selected_service_types: ['plumbing'], active_service_types: ['plumbing'],
        problem_specializations: ['leak_and_flow_diagnosis', 'pipe_and_fixture_repair'],
        districts: ['q7'], years_experience: 5, is_approved: true, is_available: true, verification_status: 'approved' }],
    ])
    const bound = await request('/rest/v1/rpc/bind_synthetic_matching_cohort', { method: 'POST', body: {
      p_cohort_id: cohortId, p_customer_ids: [owner.id], p_worker_ids: [worker.id],
    } })
    expect(bound.status, why()).toBe(200)
    const heartbeat = await request(`${base}/workers/me/matching-heartbeat`, { method: 'POST', token: worker.token, key: target?.anonKey, body: {} })
    expect(heartbeat.status, why()).toBe(200)
    seedRows([
      ['kael_chat_sessions', { id: sessionId, customer_id: owner.id, service_type: 'plumbing', status: 'active', case_phase: 'offer_review',
        scheduled_at: new Date(Date.now() + 86400_000).toISOString(),
        diagnosis_scope: { version: 1, service_type: 'plumbing', profile_id: 'plumbing-diagnose', case_phase: 'offer_review',
          facts: {}, missing_facts: [], evidence: [], scope_summary: 'Kiểm tra và báo giá sửa đường ống đang rò nước.',
          quote_ready: false, quote_blockers: ['worker_quote_required'],
          worker_requirements: ['leak_and_flow_diagnosis', 'pipe_and_fixture_repair'], next_action: { kind: 'request_worker_quote' } },
        safe_metadata: { address_district: 'q7', address_label: 'QA consent fixture', problem_chips: ['pipe_leak'] } }],
      ['kael_chat_turns', { session_id: sessionId, turn_index: 1, role: 'kael', content_type: 'analysis', safe_metadata: { service_problem_id: problemId } }],
    ])
    const before = await request(`/rest/v1/jobs?customer_id=eq.${owner.id}&select=id`)
    expect(before.payload, why('a ready intake is not consent')).toEqual([])
    const denied = await confirm(sessionId, foreign)
    expect(denied.status, why('another Customer cannot consume this offer')).toBe(404)
    expect(denied.runId, why()).toMatch(/^[0-9a-f-]{36}$/u)
    if (!denied.runId) throw new Error(why('trace identity missing'))
    expect(confirmationFailureCount(denied.runId), why('a denied actor must not be reported as a technical RPC failure')).toBe(0)
    const afterDenied = await request(`/rest/v1/confirmation_operations?session_id=eq.${sessionId}&select=id`)
    expect(afterDenied.payload, why('denial leaves no partial operation')).toEqual([])
    expect((await confirm(sessionId, worker)).status, why()).toBe(403)
    const results = await Promise.all([confirm(sessionId, owner), confirm(sessionId, owner)])
    expect(results.map(result => result.status), why('both requests must recover the same accepted operation')).toEqual([202, 202])
    const first = record(results[0].payload)
    const second = record(results[1].payload)
    expect(typeof first.job_id, why()).toBe('string')
    expect(second.job_id, why()).toBe(first.job_id)
    expect(record(second.operation).operation_id, why()).toBe(record(first.operation).operation_id)
    const replay = await confirm(sessionId, owner)
    expect(replay.status, why('lost response retries remain idempotent')).toBe(202)
    expect(record(replay.payload).job_id, why()).toBe(first.job_id)
    const receipt = await request(`${base}/kael/chat/${sessionId}/operation`, { token: owner.token, key: target?.anonKey })
    expect(receipt.status, why('a fresh screen must recover the operation without another write')).toBe(200)
    expect(record(record(receipt.payload).operation).operation_id, why()).toBe(record(first.operation).operation_id)
    const jobs = await request(`/rest/v1/jobs?customer_id=eq.${owner.id}&select=id,quote_mode,worker_id,final_price`)
    expect(jobs.payload, why('consent must not create duplicate jobs or choose a Worker')).toEqual([{ id: first.job_id, quote_mode: 'rfq', worker_id: null, final_price: null }])
    const operations = await request(`/rest/v1/confirmation_operations?session_id=eq.${sessionId}&select=id`)
    expect(operations.payload, why()).toHaveLength(1)
    const outbox = await request(`/rest/v1/workflow_outbox?operation_id=eq.${record(first.operation).operation_id}&event_type=eq.matching_requested&select=status`)
    expect(outbox.payload, why('accepted confirmation must enqueue exactly one recoverable matching task')).toEqual([{ status: 'queued' }])
    Object.assign(journey, { jobId: first.job_id, operationId: record(first.operation).operation_id })
    const unauthorizedMaintainer = await request('/functions/v1/kael-matching-maintainer', {
      method: 'POST', key: target?.anonKey, token: target?.anonKey, body: {},
    })
    expect(unauthorizedMaintainer.status, why('public callers cannot drain workflow queues')).toBe(401)
    await expect(request('/rest/v1/profiles', { method: 'POST', body: {}, maintainerSecret: 'qa-destination-sentinel' }))
      .rejects.toThrow('maintainer credential destination refused')
    const dispatched = await dispatchMatching()
    Object.assign(journey, { maintainerHttpStatus: dispatched.status,
      maintainerReason: record(dispatched.payload).error ?? record(dispatched.payload).official_match_push ?? null })
    expect([200, 500], why('record local release degradation without treating it as a healthy worker')).toContain(dispatched.status)
    if (dispatched.status === 500) {
      const result = record(dispatched.payload)
      if (result.confirmation_outbox) {
        expect(result, why()).toMatchObject({ ok: false, official_match_push: { error_code: 'OFFICIAL_MATCH_PUSH_DISPATCH_FAILED' } })
      } else {
        expect(result, why()).toEqual({ error: 'MAINTAINER_FAILED' })
      }
    }
    const deliveries = await request(`/rest/v1/job_broadcasts?job_id=eq.${first.job_id}&worker_id=eq.${worker.id}&select=id`)
    expect(deliveries.payload, why('real dispatcher must deliver this same confirmed job')).toHaveLength(1)
    if (!Array.isArray(deliveries.payload)) throw new Error(why('delivery readback unavailable'))
    const broadcastId = record(deliveries.payload[0]).id
    const opportunities = await request(`${base}/workers/me/broadcasts`, { token: worker.token, key: target?.anonKey })
    expect(opportunities.status, why()).toBe(200)
    expect(JSON.stringify(opportunities.payload), why('the actual Worker API must expose the dispatched opportunity')).toContain(String(broadcastId))
    const proposal = await request(`${base}/workers/me/broadcasts/${broadcastId}/proposal`, {
      method: 'POST', token: worker.token, key: target?.anonKey,
      body: { scope_summary: 'Khảo sát và báo giá vị trí rò nước.', price_min: 300000, price_max: 500000 },
    })
    expect(proposal.status, why()).toBe(201)
    const candidateId = record(proposal.payload).candidate_id
    const assigned = await request(`${base}/jobs/${first.job_id}/candidates/${candidateId}/confirm`, {
      method: 'POST', token: owner.token, key: target?.anonKey, body: {},
    })
    expect(assigned.status, why()).toBe(200)
    const detail = await request(`${base}/jobs/${first.job_id}`, { token: worker.token, key: target?.anonKey })
    expect(detail.status, why()).toBe(200)
    expect(record(record(detail.payload).job), why()).toMatchObject({ status: 'worker_matched', final_price: null })
    expect(record(record(detail.payload).worker), why()).toMatchObject({ id: worker.id })
    const settled = await request(`/rest/v1/workflow_outbox?operation_id=eq.${record(first.operation).operation_id}&event_type=eq.matching_requested&select=status`)
    expect(settled.payload, why('same accepted operation must finish its matching work')).toEqual([{ status: 'completed' }])
    const repeated = await dispatchMatching()
    expect([200, 500], why()).toContain(repeated.status)
    const stableDeliveries = await request(`/rest/v1/job_broadcasts?job_id=eq.${first.job_id}&worker_id=eq.${worker.id}&select=id`)
    expect(stableDeliveries.payload, why('repeated maintainer runs must not recreate official matching')).toEqual(deliveries.payload)
    const events = await request(`/rest/v1/job_events?job_id=eq.${first.job_id}&event_type=eq.customer_confirmed_worker&select=id`)
    expect(events.payload, why()).toHaveLength(1)
    const providerLogs = await request(`/rest/v1/api_logs?job_id=eq.${first.job_id}&select=id`)
    expect(providerLogs.status, why()).toBe(200)
    expect(providerLogs.payload, why('the entire RFQ matching journey must not call a provider')).toEqual([])
    const health = await request(`${base}/harness/health`)
    expect(record(record(record(health.payload).release).provider_readiness).global_ai_enabled, why()).toBe(false)
    Object.assign(journey, { broadcastId, candidateId })
  }, 60_000)
})
