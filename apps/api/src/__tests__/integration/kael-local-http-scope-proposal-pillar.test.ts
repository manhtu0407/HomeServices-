import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { pillarPrerequisite, pillarWhy, type PillarManifest } from '../pillar-manifest'
import { createLocalQaHttpHarness, localQaRecord as record, type LocalQaActor } from './local-qa-http-harness'
import { baselinePriceEvidenceCitationUrls } from '../../../../../supabase/functions/mobile-api/_shared/kael/evidence/baseline-price-evidence'

export const PILLAR = {
  id: 'P393-kael-local-http-scope-proposal',
  invariant: 'real Deno Auth and PostgreSQL bind the scripted-provider quote to one fresh Worker proposal, replay without another provider call, and apply only the owning Customer approval or rejection',
  authority: ['governance/RULES.md #2', 'governance/RULES.md #7', 'approved Build 56 journey verification plan'],
  target: 'local Deno public scope preview/proposal/decision with only the provider boundary replaced',
  layer: 'integration',
  siblings: ['P392-kael-local-http-scope-decision', 'P87-scope-change-http-authority'],
  mutation: 'replace the proposal quote_id with a fresh UUID; the public fresh-proposal assertion must fail before any scope is persisted',
} as const satisfies PillarManifest

const { target, request, customer, seedRows } = createLocalQaHttpHarness(PILLAR)
const functionName = process.env.NESTSCOUT_QA_SCOPE_FIXTURE_NAME
if (functionName !== undefined && !/^qa-scope-fixture-[a-f0-9]{12}$/u.test(functionName)) throw new Error(pillarWhy(PILLAR, 'invalid fixture function identity'))
const available = pillarPrerequisite(PILLAR, {
  available: target !== null && functionName !== undefined,
  hint: 'Requires the explicit named QA stack and guarded dedicated Deno scope-provider fixture; never a hosted provider.',
})
const integration = available ? describe.sequential : describe.skip

integration('Actual Deno scope preview and fresh proposal with provider fixture', () => {
  let worker: LocalQaActor
  let owner: LocalQaActor
  let jobId: string
  let incidentId: string
  let quoteId: string
  let requestId: string
  const base = `/functions/v1/${functionName}`
  const post = (path: string, actor: LocalQaActor, body: unknown) => request(`${base}${path}`, {
    method: 'POST', token: actor.token, key: target?.anonKey, body,
  })

  async function marketFixture() {
    const problems = await request('/rest/v1/service_problems?select=id&service_type=eq.handyman&slug=eq.replace_cabinet_hinges')
    expect(problems.status, pillarWhy(PILLAR)).toBe(200)
    expect(problems.payload, pillarWhy(PILLAR)).toHaveLength(1)
    if (!Array.isArray(problems.payload)) throw new Error(pillarWhy(PILLAR, 'service catalog absent'))
    const problemId = record(problems.payload[0]).id
    const existing = await request(`/rest/v1/price_baselines?select=source&service_problem_id=eq.${problemId}&district_code=eq.q8`)
    expect(existing.status, pillarWhy(PILLAR)).toBe(200)
    if (Array.isArray(existing.payload) && existing.payload.length) {
      expect(existing.payload, pillarWhy(PILLAR, 'never overwrite an unrelated price row')).toEqual([{ source: 'qa_scope_provider_fixture_v2' }])
      return
    }
    const now = new Date().toISOString()
    const domains = ['qa-scope-v2-a.example', 'qa-scope-v2-b.example']
    const evidence = { schema_version: 'baseline_price_evidence.v1', sources: domains.map((domain, index) => ({
      domain, url: `https://${domain}/cabinet-fixture`, observed_at: now.slice(0, 10),
      price_min: index === 0 ? 120000 : 160000, price_max: index === 0 ? 250000 : 500000, unit: 'per_cabinet_door',
      verification: { source_published_at: now.slice(0, 10), verified_at: now.slice(0, 10), verified_by: 'isolated_qa_fixture',
        ledger_ref: 'docs/foundation/source-trust-samples/qa-scope-provider-fixture-v2.json', price_snapshot_sha256: String(index + 1).repeat(64), identity_snapshot_sha256: String(index + 3).repeat(64) },
      signals: { identity_verified: true, source_type: 'direct_pricing', hcmc_relevant: true, clear_price_and_unit: true,
        integrity_verified: true, review_overdue: false, price_jump_suspected: false },
    })) }
    expect(baselinePriceEvidenceCitationUrls(evidence), pillarWhy(PILLAR, 'market fixture must satisfy the evidence input contract')).toHaveLength(2)
    seedRows([
      ...domains.map(domain => ['source_trust_registry', { domain, tier: 'tier_1', auto_tier: 1, trust_score: 1,
        is_active: true, integrity_flag: false, last_reviewed_at: now, region: 'hcmc', entity_type: 'direct_service_provider',
        criteria_met: { A: true, B: true, C: true, D: true, E: true, F: true, G: true },
        metadata: { fixture: 'qa_scope_provider_fixture_v2' } }] as const),
      ['price_baselines', { service_problem_id: problemId, service_type: 'handyman', complexity: 'small', district_code: 'q8',
        price_min: 140000, price_max: 375000, source: 'qa_scope_provider_fixture_v2', price_evidence: evidence }],
    ])
  }

  beforeAll(async () => {
    const meta = await request(`${base}/__qa_fixture`)
    expect(meta.status, pillarWhy(PILLAR, 'the dedicated real Deno fixture must be serving')).toBe(200)
    expect(record(meta.payload).mode, pillarWhy(PILLAR)).toBe('provider-fixture')
    await marketFixture()
    owner = await customer()
    worker = await customer('worker')
    seedRows([
      ['worker_profiles', { id: worker.id, legal_name: 'QA Worker fixture', date_of_birth: '1990-01-01', service_types: ['handyman'], selected_service_types: ['handyman'],
        active_service_types: ['handyman'], districts: ['q8'], is_approved: true, verification_status: 'approved' }],
    ])
  }, 45_000)

  beforeEach(() => {
    jobId = randomUUID()
    incidentId = randomUUID()
    quoteId = randomUUID()
    requestId = randomUUID()
    seedRows([
      ['jobs', { id: jobId, customer_id: owner.id, worker_id: worker.id, service_type: 'handyman',
        description: 'QA cabinet inspection fixture', address_district: 'q8', status: 'inspecting',
        kael_problem_identified: 'Căn chỉnh hai bản lề tủ', kael_complexity: 'small', kael_price_min: 150000, kael_price_max: 350000 }],
      ['kael_job_incidents', { id: incidentId, job_id: jobId, opened_by: worker.id, status: 'ready_for_scope_proposal',
        reported_description: 'Thay đúng hai bản lề tiêu chuẩn bị nứt.',
        reported_reason: 'Gỗ còn nguyên, tiếp cận bình thường, không có hư hỏng phụ.', evidence_status: 'ready', revision: 1 }],
    ])
  })

  for (const decision of ['approve', 'reject'] as const) {
    it(`previews, persists, replays and applies Customer ${decision}`, async context => {
      const qaJourney = { jobId, incidentId, quoteId, requestId, decision, ownerId: owner.id, workerId: worker.id, functionName, mode: 'provider-fixture' }
      Object.assign(context.task.meta, { qaJourney })
      const preview = await post(`/jobs/${jobId}/kael-incident/preview-scope`, worker, { client_request_id: quoteId })
      const previewCode = preview.status === 200 ? 'none' : String(record(preview.payload).code)
      expect(preview.status, pillarWhy(PILLAR, `real quote preview; code=${previewCode}`)).toBe(200)
      expect(record(record(preview.payload).quote), pillarWhy(PILLAR)).toMatchObject({
        quote_id: quoteId, customer_total: 258000, platform_fee: 38700, worker_net: 219300,
      })
      expect(preview.fixtureProviderCalls, pillarWhy(PILLAR)).toBe(1)
      expect(preview.fixtureDeniedCalls, pillarWhy(PILLAR)).toBe(0)
      const input = { client_request_id: requestId, quote_id: quoteId,
        new_description: 'Thay hai bản lề tủ đã nứt.', reason: 'Hư hỏng sau kiểm tra tại nhà.', photo_urls: [] }
      const wrongQuote = await post(`/jobs/${jobId}/scope-change`, worker, { ...input, client_request_id: randomUUID(), quote_id: randomUUID() })
      expect(wrongQuote.status, pillarWhy(PILLAR, 'unbound quote must be refused')).toBe(409)
      expect(wrongQuote.fixtureProviderCalls, pillarWhy(PILLAR)).toBe(0)
      expect(wrongQuote.fixtureDeniedCalls, pillarWhy(PILLAR)).toBe(0)
      const notPersisted = await request(`/rest/v1/scope_change_requests?select=id&job_id=eq.${jobId}`)
      expect(notPersisted.status, pillarWhy(PILLAR)).toBe(200)
      expect(notPersisted.payload, pillarWhy(PILLAR)).toEqual([])
      const denied = await post(`/jobs/${jobId}/scope-change`, owner, input)
      expect(denied.status, pillarWhy(PILLAR)).toBe(403)
      const proposed = await post(`/jobs/${jobId}/scope-change`, worker, input)
      const proposalCode = proposed.status === 201 ? 'none' : String(record(proposed.payload).code)
      expect(proposed.status, pillarWhy(PILLAR, `fresh proposal; code=${proposalCode}`)).toBe(201)
      expect(proposed.fixtureProviderCalls, pillarWhy(PILLAR)).toBe(0)
      expect(proposed.fixtureDeniedCalls, pillarWhy(PILLAR)).toBe(0)
      const scopeId = record(proposed.payload).scope_change_id
      expect(typeof scopeId, pillarWhy(PILLAR)).toBe('string')
      const replay = await post(`/jobs/${jobId}/scope-change`, worker, input)
      expect(replay.status, pillarWhy(PILLAR)).toBe(201)
      expect(record(replay.payload).scope_change_id, pillarWhy(PILLAR)).toBe(scopeId)
      expect(replay.fixtureProviderCalls, pillarWhy(PILLAR)).toBe(0)
      expect(replay.fixtureDeniedCalls, pillarWhy(PILLAR)).toBe(0)
      const stored = await request(`/rest/v1/scope_change_requests?select=id,status,kael_computed_max&job_id=eq.${jobId}`)
      expect(stored.status, pillarWhy(PILLAR)).toBe(200)
      expect(stored.payload, pillarWhy(PILLAR, 'one persisted fresh proposal')).toEqual([
        { id: scopeId, status: 'waiting_customer_decision', kael_computed_max: 258000 },
      ])
      const decided = await post(`/scope-changes/${scopeId}/decide`, owner, { decision })
      expect(decided.status, pillarWhy(PILLAR)).toBe(200)
      expect(record(decided.payload).status, pillarWhy(PILLAR)).toBe(decision === 'approve' ? 'approved_by_customer' : 'rejected_by_customer')
      expect(decided.fixtureProviderCalls, pillarWhy(PILLAR)).toBe(0)
      expect(decided.fixtureDeniedCalls, pillarWhy(PILLAR)).toBe(0)
      const job = await request(`/rest/v1/jobs?select=status,worker_id,kael_price_max,final_price&id=eq.${jobId}`)
      expect(job.status, pillarWhy(PILLAR)).toBe(200)
      expect(job.payload, pillarWhy(PILLAR)).toEqual([{
        status: decision === 'approve' ? 'repairing' : 'inspecting', worker_id: worker.id,
        kael_price_max: 350000, final_price: decision === 'approve' ? 258000 : null,
      }])
      const canonical = await request('/functions/v1/mobile-api/harness/health')
      expect(canonical.status, pillarWhy(PILLAR)).toBe(200)
      expect(record(record(record(canonical.payload).release).provider_readiness).global_ai_enabled, pillarWhy(PILLAR, 'canonical monitor/runtime must retain its kill switch')).toBe(false)
      Object.assign(context.task.meta, { qaJourney: {
        ...qaJourney, scopeId,
        fixtureProviderCalls: { preview: preview.fixtureProviderCalls, proposal: proposed.fixtureProviderCalls, replay: replay.fixtureProviderCalls, decision: decided.fixtureProviderCalls },
        deniedCalls: { preview: preview.fixtureDeniedCalls, proposal: proposed.fixtureDeniedCalls, replay: replay.fixtureDeniedCalls, decision: decided.fixtureDeniedCalls },
      } })
    }, 90_000)
  }
})
