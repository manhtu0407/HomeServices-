import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { pillarPrerequisite, pillarWhy, type PillarManifest } from '../pillar-manifest'
import { createLocalQaHttpHarness, localQaRecord as record, type LocalQaActor } from './local-qa-http-harness'

export const PILLAR = {
  id: 'P392-kael-local-http-scope-decision',
  invariant: 'actual local Edge and PostgreSQL restrict scope decisions to the owning Customer, preserve price and assignment on rejection, and serialize concurrent decisions',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8', 'approved Build 56 journey verification plan'],
  target: 'POST mobile-api/scope-changes/:id/decide with real Auth and PostgreSQL',
  layer: 'integration',
  siblings: ['P391-kael-local-http-intake', 'P87-scope-change-http-authority', 'P87-scope-decision-customer-authority-sql'],
  mutation: 'use the owning Customer token in the foreign-Customer attempt; the actual HTTP ownership denial assertion must fail, then pass after restoration',
} as const satisfies PillarManifest

const { target, request, customer, seedRows } = createLocalQaHttpHarness(PILLAR)
const available = pillarPrerequisite(PILLAR, {
  available: target !== null,
  hint: 'Requires the guarded named QA HTTP runner with inference disabled; fixtures begin at a saved scope quote, not at model analysis.',
})
const integration = available ? describe.sequential : describe.skip

integration('Scope decisions through actual local HTTP and PostgreSQL', () => {
  let owner: LocalQaActor
  let worker: LocalQaActor
  let foreign: LocalQaActor

  beforeAll(async () => {
    const health = await request('/functions/v1/mobile-api/harness/health')
    expect(health.status, pillarWhy(PILLAR)).toBe(200)
    expect(record(record(health.payload).environment).name, pillarWhy(PILLAR)).toBe('local')
    expect(record(record(record(health.payload).release).provider_readiness).global_ai_enabled, pillarWhy(PILLAR)).toBe(false)
    owner = await customer()
    worker = await customer('worker')
    foreign = await customer()
  }, 40_000)

  async function fixture(resumeStatus = 'arrived', timing = 'on_site', verified = true) {
    const job = randomUUID()
    const scope = randomUUID()
    const incident = randomUUID()
    const quote = randomUUID()
    const now = new Date().toISOString()
    const expires = new Date(Date.now() + 900_000).toISOString()
    const evidence = {
      schema_version: 'baseline_price_evidence_receipt.v1', accepted_source_count: 2,
      aggregate_price_min: 240000, aggregate_price_max: 360000, high_trust_source_count: 2,
      quorum_met: true, required_quorum: 2, unit: 'per_visit',
      sources: ['source-a.example', 'source-b.example'].map(domain => ({
        domain, url: `https://${domain}/price`, observed_at: now.slice(0, 10),
        price_min: 240000, price_max: 360000, unit: 'per_visit', effective_tier: 1, weight: 1,
      })),
    }
    const quoteValue = {
      schema_version: 'scope_change_worker_quote.v1', quote_id: quote, incident_id: incident,
      job_id: job, selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
      customer_total: 300000, platform_fee: 45000, worker_net: 255000,
      commission_level: 1, commission_rate_bps: 1500, reference_price_min: 240000,
      reference_price_max: 360000, baseline_used: 'plumbing:pipe_leak:medium:hcmc_all',
      baseline_source: 'isolated_qa_fixture', calculation: 'Verified fixture range midpoint',
      expires_at: expires, baseline_evidence: evidence,
    }
    const review = {
      price_source: 'verified_baseline', pricing_mode: 'full_scope_total',
      selection_rule: quoteValue.selection_rule, baseline_used: quoteValue.baseline_used,
      baseline_source: quoteValue.baseline_source, reference_price_min: 240000,
      reference_price_max: 360000, baseline_evidence: evidence,
      worker_price_confirmation: { confirmed: true, quote_id: quote, confirmed_at: now },
      stakeholder_balance: {
        customer_total: 300000, platform_fee: 45000, worker_net: 255000,
        commission_level: 1, commission_rate_bps: 1500,
        customer_confirmation_required: true, worker_confirmation_required: true,
      },
    }
    const priorReview = {
      ...review, reference_price_min: 160000, reference_price_max: 240000,
      baseline_evidence: { ...evidence, aggregate_price_min: 160000, aggregate_price_max: 240000,
        sources: evidence.sources.map(source => ({ ...source, price_min: 160000, price_max: 240000 })) },
      worker_price_confirmation: { ...review.worker_price_confirmation, quote_id: randomUUID() },
      stakeholder_balance: { ...review.stakeholder_balance, customer_total: 200000, platform_fee: 30000, worker_net: 170000 },
    }
    // Only initial QA state is seeded; every decision goes through the public Edge handler.
    seedRows([
      ['jobs', { id: job, customer_id: owner.id, worker_id: worker.id, service_type: 'plumbing',
        description: 'Isolated QA scope decision fixture', address_district: 'q7',
        status: 'scope_change_pending', final_price: 200000 }],
      ['kael_job_incidents', { id: incident, job_id: job, opened_by: worker.id,
        status: 'ready_for_scope_proposal', reported_description: 'QA scope fixture',
        reported_reason: 'QA Customer authority', evidence_status: 'ready', revision: 1,
        scope_price_quote_id: quote, scope_price_quote: quoteValue,
        scope_price_quote_revision: 1, scope_price_quote_expires_at: expires,
        scope_price_quote_confirmed_at: now }],
      ['scope_change_requests', { id: randomUUID(), job_id: job, worker_id: worker.id,
        requested_description: 'Previously approved QA scope', reason: 'QA original financial receipt',
        status: 'approved_by_customer', kael_computed_min: 200000, kael_computed_max: 200000,
        request_timing: 'on_site', resume_job_status: 'arrived', customer_decision_at: now,
        kael_review: priorReview }],
      ['scope_change_requests', { id: scope, job_id: job, worker_id: worker.id,
        requested_description: 'QA changed scope', reason: 'QA confirmed stored quote',
        status: 'waiting_customer_decision', kael_computed_min: 300000, kael_computed_max: 300000,
        request_timing: timing, resume_job_status: resumeStatus,
        kael_review: { ...review, worker_price_confirmation: { ...review.worker_price_confirmation, confirmed: verified } } }],
    ])
    return { job, scope }
  }

  const decide = (scope: string, actor: LocalQaActor, decision = 'reject') => request(
    `/functions/v1/mobile-api/scope-changes/${scope}/decide`,
    { method: 'POST', key: target?.anonKey, token: actor.token, body: { decision } },
  )
  async function jobState(job: string) {
    const result = await request(`/rest/v1/jobs?select=id,status,final_price,worker_id&id=eq.${job}`)
    expect(result.status, pillarWhy(PILLAR)).toBe(200)
    expect(result.payload, pillarWhy(PILLAR)).toHaveLength(1)
    if (!Array.isArray(result.payload)) throw new Error(pillarWhy(PILLAR, 'expected job rows'))
    return record(result.payload[0])
  }

  async function effects(job: string, decision: 'approve' | 'reject') {
    const event = decision === 'approve' ? 'customer_confirmed_scope_change' : 'customer_rejected_scope_change'
    const events = await request(`/rest/v1/job_events?select=id&job_id=eq.${job}&event_type=eq.${event}`)
    expect(events.status, pillarWhy(PILLAR)).toBe(200)
    expect(events.payload, pillarWhy(PILLAR, 'one decision audit event after retries')).toHaveLength(1)
    const notification = decision === 'approve' ? 'scope_change_approved' : 'scope_change_rejected'
    const notifications = await request(`/rest/v1/notifications?select=id&job_id=eq.${job}&event_type=eq.${notification}`)
    expect(notifications.status, pillarWhy(PILLAR)).toBe(200)
    expect(notifications.payload, pillarWhy(PILLAR, 'one persisted Worker notification after retries')).toHaveLength(1)
  }

  it('denies Worker and foreign Customer without changing the job', async () => {
    const item = await fixture()
    const workerDecision = await decide(item.scope, worker)
    expect(workerDecision.status, pillarWhy(PILLAR)).toBe(403)
    const foreignDecision = await decide(item.scope, foreign)
    expect([403, 404], pillarWhy(PILLAR, 'foreign Customer must not decide')).toContain(foreignDecision.status)
    expect(await jobState(item.job), pillarWhy(PILLAR)).toMatchObject({ status: 'scope_change_pending', final_price: 200000, worker_id: worker.id })
  }, 40_000)

  it('rejects back to the stored status without changing price or assignment', async () => {
    const item = await fixture()
    const decision = await decide(item.scope, owner)
    expect(decision.status, pillarWhy(PILLAR)).toBe(200)
    expect(record(decision.payload), pillarWhy(PILLAR)).toMatchObject({ scope_change_id: item.scope, status: 'rejected_by_customer' })
    expect(await jobState(item.job), pillarWhy(PILLAR)).toMatchObject({ status: 'arrived', final_price: 200000, worker_id: worker.id })
    const repeated = await decide(item.scope, owner)
    expect(repeated.status, pillarWhy(PILLAR, 'current contract explicitly refuses an already decided request')).toBe(409)
    expect(record(repeated.payload).code, pillarWhy(PILLAR)).toBe('ALREADY_DECIDED')
    const changed = await decide(item.scope, owner, 'approve')
    expect(changed.status, pillarWhy(PILLAR, 'a changed decision must not reverse the committed rejection')).toBe(409)
    expect(await jobState(item.job), pillarWhy(PILLAR)).toMatchObject({ status: 'arrived', final_price: 200000, worker_id: worker.id })
    await effects(item.job, 'reject')
  }, 40_000)

  it('serializes two approvals and persists the stored quote exactly once', async () => {
    const item = await fixture('inspecting')
    const results = await Promise.all([decide(item.scope, owner, 'approve'), decide(item.scope, owner, 'approve')])
    expect(results.map(result => result.status).sort(), pillarWhy(PILLAR)).toEqual([200, 409])
    expect(await jobState(item.job), pillarWhy(PILLAR)).toMatchObject({ status: 'repairing', final_price: 300000, worker_id: worker.id })
    const scope = await request(`/rest/v1/scope_change_requests?select=status,customer_decision_at&id=eq.${item.scope}`)
    expect(scope.status, pillarWhy(PILLAR)).toBe(200)
    expect(scope.payload, pillarWhy(PILLAR)).toHaveLength(1)
    if (!Array.isArray(scope.payload)) throw new Error(pillarWhy(PILLAR, 'expected scope rows'))
    expect(record(scope.payload[0]).status, pillarWhy(PILLAR)).toBe('approved_by_customer')
    expect(Number.isFinite(Date.parse(String(record(scope.payload[0]).customer_decision_at))), pillarWhy(PILLAR)).toBe(true)
    await effects(item.job, 'approve')
  }, 40_000)

  it.each(['worker_matched', 'worker_on_way'])('approves pre-arrival scope back to %s', async resumeStatus => {
    const item = await fixture(resumeStatus, 'pre_arrival')
    const result = await decide(item.scope, owner, 'approve')
    expect(result.status, pillarWhy(PILLAR)).toBe(200)
    expect(await jobState(item.job), pillarWhy(PILLAR)).toMatchObject({ status: resumeStatus, final_price: 300000, worker_id: worker.id })
    await effects(item.job, 'approve')
  }, 40_000)

  it('refuses to persist a pending scope without confirmed quote evidence', async () => {
    const path = `/rest/v1/jobs?select=id&customer_id=eq.${owner.id}&order=id.asc`
    const before = await request(path)
    expect(before.status, pillarWhy(PILLAR)).toBe(200)
    await expect(fixture('inspecting', 'on_site', false), pillarWhy(PILLAR, 'the database must reject invalid pending quote evidence')).rejects.toThrow(/code=23514/u)
    const after = await request(path)
    expect(after.status, pillarWhy(PILLAR)).toBe(200)
    expect(after.payload, pillarWhy(PILLAR, 'failed fixture transaction must not retain a partial job')).toEqual(before.payload)
  }, 40_000)

  it('commits one outcome when approval races rejection', async () => {
    const item = await fixture()
    const results = await Promise.all([decide(item.scope, owner, 'approve'), decide(item.scope, owner, 'reject')])
    expect(results.map(result => result.status).sort(), pillarWhy(PILLAR)).toEqual([200, 409])
    const approved = results[0].status === 200
    expect(await jobState(item.job), pillarWhy(PILLAR)).toMatchObject({
      status: approved ? 'repairing' : 'arrived', final_price: approved ? 300000 : 200000, worker_id: worker.id,
    })
    await effects(item.job, approved ? 'approve' : 'reject')
  }, 40_000)
})
