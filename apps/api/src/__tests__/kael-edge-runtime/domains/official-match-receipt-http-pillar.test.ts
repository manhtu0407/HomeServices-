import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P123-official-match-receipt-http',
  invariant: 'Official-match confirmation acknowledges only an exact typed receipt; uncertain responses require reconciliation without leaking database details',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8'],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/candidate.ts',
  layer: 'integration',
  siblings: ['P122-official-match-durability-sql', 'P21-matching-guard-liveness'],
  mutation: 'Return DB_ERROR or accept truthy ok and foreign candidate receipts; the recoverable HTTP outcome assertions fail',
} as const satisfies PillarManifest

const JOB = 'c1230000-0000-4000-8000-000000000001'
const CUSTOMER = 'c1230000-0000-4000-8000-000000000002'
const WORKER = 'c1230000-0000-4000-8000-000000000003'
const CANDIDATE = 'c1230000-0000-4000-8000-000000000004'
const success = { ok: true, error_code: null, job_status: 'worker_matched',
  candidate_id: CANDIDATE, worker_id: WORKER, already_applied: true }

function setup(options: { mode?: string; role?: 'customer' | 'worker' | 'admin';
  receipt?: unknown; error?: { code: string; message: string }; candidateError?: boolean;
  candidateWorker?: string } = {}) {
  const rpc = options.mode === 'kael_auto_quote' ? 'confirm_worker_candidate_atomic' : 'confirm_worker_matching_proposal_atomic'
  const client = makeSequenceClient([], {
    [rpc]: [{ data: options.error ? null : options.receipt ?? [success], error: options.error ?? null }],
  }, {
    jobs: [{ data: { id: JOB, customer_id: CUSTOMER, worker_id: WORKER,
      status: 'worker_matched', quote_mode: options.mode ?? 'rfq' }, error: null },
      { data: { id: JOB, customer_id: CUSTOMER, worker_id: WORKER,
        service_type: 'plumbing', status: 'worker_matched', address_district: 'q7',
        kael_problem_identified: 'Rò nước' }, error: null }],
    job_worker_candidates: [{ data: options.candidateError ? null : { id: CANDIDATE,
      job_id: JOB, worker_id: options.candidateWorker ?? WORKER, status: 'customer_confirmed',
      proposed_at: '2026-09-08T00:00:00Z', customer_decided_at: '2026-09-08T00:00:00Z' },
      error: options.candidateError ? { code: '08006', message: 'private detail' } : null }],
    worker_profiles: [{ data: { id: WORKER, rating: null, total_jobs: 0, years_experience: 5,
      verification_status: 'approved' }, error: null }],
    profiles: [{ data: { full_name: 'Thợ kiểm thử', avatar_url: null }, error: null }],
    customer_favorite_workers: [{ data: null, error: null }],
  })
  const handler = createMobileApiHandler({
    authenticate: async () => ({ success: true, user: { id: CUSTOMER }, role: options.role ?? 'customer',
      supabase: client, userSupabase: client, privilegedSupabase: client }),
    services: createEdgeServices({}),
  })
  return { client, run: () => handler(new Request(
    `https://edge.test/jobs/${JOB}/candidates/${CANDIDATE}/confirm`, { method: 'POST' })) }
}

describe('official-match receipt boundary', () => {
  installEdgeRuntimeTestHooks()

  it.each(['kael_auto_quote', 'rfq', 'inspection_only'])('recovers a valid %s receipt', async (mode) => {
    const { run } = setup({ mode })
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toMatchObject({ job_id: JOB, status: 'worker_matched',
      already_applied: true, candidate: { candidate_id: CANDIDATE, status: 'customer_confirmed' } })
  })

  it.each([
    { receipt: [] }, { receipt: [success, success] }, { receipt: [{ ...success, ok: 'true' }] },
    { receipt: [{ ...success, candidate_id: JOB }] },
    { receipt: [{ ...success, already_applied: 'true' }] },
    { receipt: [{ ...success, error_code: 'INVALID_STATUS' }] },
    { receipt: [{ ...success, ok: false, error_code: null }] },
    { receipt: [{ ...success, ok: false, error_code: 'invented' }] },
    { receipt: [{ ...success, job_status: 'invented' }] },
    { error: { code: '08006', message: 'private detail' } },
    { candidateError: true }, { candidateWorker: JOB },
  ])('does not misreport an uncertain committed outcome: %j', async (options) => {
    const { run } = setup(options)
    const response = await run()
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(options))).toBe(503)
    const body = await response.json()
    expect(body).toMatchObject({ code: 'CANDIDATE_DECISION_OUTCOME_UNKNOWN', reconcile_required: true })
    expect(JSON.stringify(body)).not.toContain('private detail')
    expect(response.headers.get('x-support-code')).toBeTruthy()
    expect(response.headers.get('x-trace-id')).toBeTruthy()
  })

  it.each(['worker', 'admin'] as const)('denies %s before the command', async (role) => {
    const { run, client } = setup({ role })
    expect((await run()).status).toBe(403)
    expect(client.calls.some((call) => call.table.includes('confirm_worker_'))).toBe(false)
  })

  it('refuses an invalid priced receipt with its own safe conflict code', async () => {
    const { run } = setup({ mode: 'kael_auto_quote',
      receipt: [{ ...success, ok: false, error_code: 'PRICE_QUOTE_INVALID', already_applied: false }] })
    const response = await run()
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'PRICE_QUOTE_INVALID' })
  })

  it('acknowledges a fresh commit without inline notification or provider delivery', async () => {
    const { run, client } = setup({ receipt: [{ ...success, already_applied: false }] })
    expect((await run()).status, pillarWhy(PILLAR)).toBe(200)
    expect(client.calls.filter((call) => call.table === 'rpc:insert_notification_atomic'),
      pillarWhy(PILLAR, 'participant notifications belong to the committed transaction')).toHaveLength(0)
    expect(client.calls.some((call) => call.table === 'device_push_tokens')).toBe(false)
    expect(client.calls.some((call) => call.table === 'jobs' &&
      call.operations.some((operation) => operation[0] === 'update')),
      pillarWhy(PILLAR, 'guidance must recover from reads without a post-commit job write')).toBe(false)
  })
})
