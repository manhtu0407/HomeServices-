import { describe, expect, it, vi } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { QueryResult } from '../harness/sequence-client'
import { testBaselineEvidenceDocument, testSourceTrustRegistryRows } from './kael-scope-change-source-fixtures'

export const PILLAR = {
  id: 'P87-scope-change-http-authority',
  invariant: 'The HTTP scope flow binds a real Worker quote before proposal, only Customer can decide, and retries return the durable proposal or an explicit already-decided refusal without repeating final-price writes',
  authority: ['governance/RULES.md #7', 'approved Production Agentic Transaction Readiness plan (bilateral scope/final-price agreement)'],
  target: 'supabase/functions/mobile-api/_shared/domains/job/scope-change/decision.ts',
  layer: 'security-negative',
  siblings: ['P79-worker-completion-media-ownership', 'P86-customer-completion-http'],
  mutation: 'allow Admin scope decisions without the explicit Customer domain guard; the HTTP Admin denial test issues the atomic decision and fails',
} as const satisfies PillarManifest

const JOB = 'f8700000-0000-4000-8000-000000000001'
const WORKER = 'f8700000-0000-4000-8000-000000000002'
const CUSTOMER = 'f8700000-0000-4000-8000-000000000003'
const INCIDENT = 'f8700000-0000-4000-8000-000000000004'
const SCOPE = 'f8700000-0000-4000-8000-000000000005'
const QUOTE = 'f8700000-0000-4000-8000-000000000006'
const CLAIM = 'f8700000-0000-4000-8000-000000000007'
const NOW = '2026-08-14T08:00:00.000Z'
const evidence = `supabase://job-media/${JOB}/scope_change_evidence/photo.jpg`

function setup(input: { role?: 'customer' | 'worker' | 'admin'; actorId?: string; claimError?: string; decisionError?: string } = {}) {
  let role = input.role ?? 'worker'
  let actorId = input.actorId ?? (role === 'worker' ? WORKER : CUSTOMER)
  let claimed = false
  let decided = false
  const job = {
    id: JOB, status: 'inspecting', customer_id: CUSTOMER, worker_id: WORKER,
    service_type: 'handyman', address_district: 'q7', description: 'Căn chỉnh một cánh tủ có hai bản lề.',
    kael_problem_identified: 'Căn chỉnh hai bản lề tủ', kael_complexity: 'small',
    kael_price_min: 150000, kael_price_max: 350000,
  }
  const incident: Record<string, unknown> = {
    id: INCIDENT, job_id: JOB, status: 'ready_for_scope_proposal', evidence_status: 'ready', revision: 4,
    reported_description: 'Thay đúng hai bản lề tiêu chuẩn bị nứt.',
    reported_reason: 'Gỗ còn nguyên, tiếp cận bình thường, không có hư hỏng phụ.',
    evidence_photo_urls: [evidence], created_at: NOW, updated_at: NOW,
  }
  const scope: Record<string, unknown> = {
    id: SCOPE, job_id: JOB, status: 'waiting_customer_decision', created_at: NOW,
    request_timing: 'on_site', resume_job_status: 'inspecting', kael_review: {},
  }
  const repeated = (data: unknown): QueryResult[] => Array.from({ length: 24 }, () => ({ data, error: null }))
  const rpcResults: Record<string, QueryResult[]> = {
    validate_scope_change_evidence_refs: repeated([{ ok: true, validated_refs: [evidence] }]),
    insert_notification_atomic: repeated([{ notification_id: 'notification-1', created_at_ts: NOW }]),
  }
  const client = makeSequenceClient([], rpcResults, {
    jobs: repeated(job), kael_job_incidents: repeated(incident), scope_change_requests: repeated(scope),
    service_problems: repeated([{ id: 'problem-hinge-replacement', default_complexity: 'small' }]),
    price_baselines: repeated([{
      complexity: 'small', district_code: 'hcmc_all', price_min: 140000, price_max: 375000,
      source: 'multi_source_hcmc_cabinet_door_2026_08', price_evidence: testBaselineEvidenceDocument(),
    }]),
    source_trust_registry: repeated(testSourceTrustRegistryRows()),
    worker_scope_change_stats: repeated({ scope_change_rate: 0 }), push_tokens: repeated([]),
  })
  const rpc = client.rpc.bind(client)
  client.rpc = (name, args) => {
    if (name === 'save_job_incident_scope_price_quote_atomic') {
      incident.scope_price_quote = args?.p_quote
      rpcResults[name] = [{ data: [{ ok: true, incident }], error: null }]
    }
    if (name === 'claim_job_incident_scope_proposal_atomic') {
      incident.scope_price_quote_confirmed_at = NOW
      rpcResults[name] = [{ data: [{
        ok: !input.claimError, claimed: !claimed, idempotent: claimed,
        error_code: input.claimError ?? null, incident,
      }], error: null }]
    }
    if (name === 'request_job_incident_scope_change_atomic') {
      claimed = true
      incident.status = 'scope_proposed'
      incident.scope_change_id = SCOPE
      scope.kael_review = args?.p_kael_review
      scope.kael_computed_min = args?.p_kael_computed_min
      scope.kael_computed_max = args?.p_kael_computed_max
      rpcResults[name] = [{ data: [{ ok: true, scope_change_id: SCOPE, scope_status: 'waiting_customer_decision', created_at_ts: NOW }], error: null }]
    }
    if (name === 'decide_scope_change_atomic') {
      const errorCode = input.decisionError ?? (actorId !== CUSTOMER ? 'NOT_FOUND' : decided ? 'ALREADY_DECIDED' : null)
      const scopeStatus = args?.p_decision === 'approve' ? 'approved_by_customer' : 'rejected_by_customer'
      rpcResults[name] = [{ data: [{ ok: !errorCode, error_code: errorCode, job_id_out: JOB, scope_status: scopeStatus, decided_at_ts: NOW }], error: null }]
      if (!errorCode) decided = true
    }
    return rpc(name, args)
  }
  const handler = createMobileApiHandler({
    authenticate: async () => ({ success: true, user: { id: actorId }, role, supabase: client, privilegedSupabase: client, userSupabase: client }),
    services: createEdgeServices({ anthropicApiKey: 'fixture-provider-key' }),
  })
  const post = (path: string, body: unknown) => handler(new Request(`https://edge.test${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
  return {
    client,
    preview: () => post(`/jobs/${JOB}/kael-incident/preview-scope`, { client_request_id: QUOTE }),
    propose: (body: unknown = { client_request_id: CLAIM, quote_id: QUOTE }) => post(`/jobs/${JOB}/kael-incident/propose-scope`, body),
    decide: (decision = 'reject') => post(`/scope-changes/${SCOPE}/decide`, { decision }),
    asCustomer: () => { role = 'customer'; actorId = CUSTOMER },
  }
}

function calls(client: ReturnType<typeof makeSequenceClient>, name: string) {
  return client.calls.filter((call) => call.table === `rpc:${name}`)
}

function scriptedProvider() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(NOW))
  vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'KAEL_SOURCE_TRUST_HIGH_VALUE_VND'
    ? '1000000' : name === 'KAEL_AUTONOMY_FULL_ENABLED' ? 'true' : undefined } })
  const fetch = vi.fn(async () => new Response(JSON.stringify({
    content: [{ type: 'text', text: JSON.stringify({
      problem_slug: 'replace_cabinet_hinges', complexity_assessment: 'small', confidence: 0.88,
      confirmed_facts: ['Đúng hai bản lề', 'Gỗ và cánh tủ còn nguyên', 'Lối tiếp cận bình thường'], unknowns: [],
      pricing_factors: { quantity: 2, access_condition: 'normal', secondary_damage: 'none_confirmed', material_tier: 'standard' },
      problem_summary: 'Hai bản lề nứt cần thay đúng loại tương thích.', advisory: 'Giữ nguyên gỗ và căn chỉnh lại cánh tủ sau khi thay.',
    }) }], usage: { input_tokens: 120, output_tokens: 48 },
  })))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('Scope change at the public HTTP boundary', () => {
  installEdgeRuntimeTestHooks()

  it('previews and proposes the confirmed quote then accepts the Customer decision', async () => {
    const provider = scriptedProvider()
    const fixture = setup()
    const preview = await fixture.preview()
    const previewBody = await preview.json()
    expect(preview.status, pillarWhy(PILLAR, JSON.stringify(previewBody))).toBe(200)
    expect(previewBody.quote).toMatchObject({ customer_total: 258000, platform_fee: 38700, worker_net: 219300, quote_id: QUOTE })
    const proposal = await fixture.propose()
    const proposalBody = await proposal.json()
    expect(proposal.status, pillarWhy(PILLAR, JSON.stringify(proposalBody))).toBe(200)
    expect(proposalBody).toMatchObject({ incident: { status: 'scope_proposed' }, scope_change: { scope_change_id: SCOPE, status: 'waiting_customer_decision' } })
    const persistence = calls(fixture.client, 'request_job_incident_scope_change_atomic')
    expect(persistence).toHaveLength(1)
    expect(persistence[0].operations[0][2]).toMatchObject({
      p_claim_id: CLAIM, p_worker_id: WORKER, p_job_id: JOB,
      p_kael_review: { worker_price_confirmation: { confirmed: true, quote_id: QUOTE }, stakeholder_balance: { customer_confirmation_required: true } },
    })
    fixture.asCustomer()
    const decision = await fixture.decide('approve')
    const decisionBody = await decision.json()
    expect(decision.status, pillarWhy(PILLAR, JSON.stringify(decisionBody))).toBe(200)
    expect(decisionBody).toMatchObject({ scope_change_id: SCOPE, job_id: JOB, status: 'approved_by_customer' })
    expect(calls(fixture.client, 'decide_scope_change_atomic')[0].operations[0][2]).toEqual({ p_scope_change_id: SCOPE, p_customer_id: CUSTOMER, p_decision: 'approve' })
    expect(provider).toHaveBeenCalledTimes(2)
    expect(fixture.client.calls.some((call) => call.table === 'jobs' && call.operations.some((op) => op[0] === 'update' && JSON.stringify(op[1]).includes('final_price')))).toBe(false)
  })

  it('recovers a durable proposal after response loss without rerunning pricing', async () => {
    const provider = scriptedProvider()
    const fixture = setup()
    expect((await fixture.preview()).status).toBe(200)
    expect((await fixture.propose()).status).toBe(200)
    const response = await fixture.propose()
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toMatchObject({ scope_change: { scope_change_id: SCOPE, status: 'waiting_customer_decision' } })
    expect(calls(fixture.client, 'request_job_incident_scope_change_atomic')).toHaveLength(1)
    expect(provider).toHaveBeenCalledTimes(2)
  })

  it.each(['customer', 'admin'] as const)('refuses proposal by the %s actor before the claim RPC', async (role) => {
    const fixture = setup({ role })
    expect((await fixture.propose()).status, pillarWhy(PILLAR)).toBe(403)
    expect(calls(fixture.client, 'claim_job_incident_scope_proposal_atomic')).toEqual([])
  })

  it('conceals the job from an unassigned Worker before proposal', async () => {
    const fixture = setup({ actorId: 'f8700000-0000-4000-8000-000000000099' })
    expect((await fixture.propose()).status, pillarWhy(PILLAR)).toBe(404)
    expect(calls(fixture.client, 'claim_job_incident_scope_proposal_atomic')).toEqual([])
  })

  it.each(['STATUS_CHANGED', 'PROPOSAL_IN_PROGRESS'])('preserves the proposal claim refusal %s without pricing', async (claimError) => {
    const provider = scriptedProvider()
    const fixture = setup({ claimError })
    const response = await fixture.propose()
    expect(response.status, pillarWhy(PILLAR)).toBe(409)
    expect(await response.json()).toMatchObject({ code: claimError === 'STATUS_CHANGED' ? 'STATUS_CHANGED' : 'INCIDENT_NOT_READY' })
    expect(provider).not.toHaveBeenCalled()
    expect(calls(fixture.client, 'request_job_incident_scope_change_atomic')).toEqual([])
  })

  it.each(['worker', 'admin'] as const)('refuses a scope decision from the %s actor', async (role) => {
    const fixture = setup({ role, actorId: CUSTOMER })
    expect((await fixture.decide()).status, pillarWhy(PILLAR, 'even an owner id cannot replace the Customer role')).toBe(403)
    expect(calls(fixture.client, 'decide_scope_change_atomic')).toEqual([])
  })

  it('refuses approval when the verified final-price receipt is missing', async () => {
    const fixture = setup({ role: 'customer' })
    const response = await fixture.decide('approve')
    expect(response.status, pillarWhy(PILLAR)).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'KAEL_PRICE_UNVERIFIED' })
    expect(calls(fixture.client, 'decide_scope_change_atomic')).toEqual([])
  })

  it.each(['NOT_FOUND', 'STATUS_CHANGED', 'INVALID_STATUS'])('preserves the atomic decision refusal %s', async (decisionError) => {
    const fixture = setup({ role: 'customer', decisionError })
    const response = await fixture.decide()
    expect(response.status, pillarWhy(PILLAR)).toBe(decisionError === 'NOT_FOUND' ? 404 : 409)
    expect(await response.json()).toMatchObject({ code: decisionError })
    expect(calls(fixture.client, 'insert_notification_atomic')).toEqual([])
  })

  it('reports a duplicate decision explicitly without repeating notification effects', async () => {
    const fixture = setup({ role: 'customer' })
    expect((await fixture.decide()).status).toBe(200)
    const response = await fixture.decide()
    expect(response.status, pillarWhy(PILLAR, 'already-decided is not a fabricated fresh success')).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'ALREADY_DECIDED' })
    expect(calls(fixture.client, 'insert_notification_atomic')).toHaveLength(1)
  })

  it('rejects malformed proposal identity at the HTTP schema gate', async () => {
    const fixture = setup()
    expect((await fixture.propose({ client_request_id: CLAIM })).status, pillarWhy(PILLAR)).toBe(400)
    expect(calls(fixture.client, 'claim_job_incident_scope_proposal_atomic')).toEqual([])
  })
})
