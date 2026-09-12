import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { requireWorkerKaelChatJob } from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/kael-chat-turn'
import { db } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P127-worker-brief-recovery',
  invariant: 'Worker job reads reconstruct guidance from the current assignment without post-confirm writes, stale address access, or invented RFQ earnings',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8', 'governance/RULES.md #9'],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/jobs.ts',
  layer: 'integration',
  siblings: ['P123-official-match-receipt-http', 'P01-commission-math'],
  mutation: 'Return the stored guidance or omit the read-time projection; the missing/stale brief assertions fail',
} as const satisfies PillarManifest

const JOB = 'c1270000-0000-4000-8000-000000000001'
const WORKER = 'c1270000-0000-4000-8000-000000000002'
const CUSTOMER = 'c1270000-0000-4000-8000-000000000003'
const job = { id: JOB, worker_id: WORKER, customer_id: CUSTOMER, status: 'worker_matched',
  service_type: 'plumbing', description: 'Kiểm tra rò nước', kael_problem_identified: 'Rò nước',
  quote_mode: 'kael_auto_quote', final_price: 200_000, kael_price_min: 100_000, kael_price_max: 250_000,
  worker_commission_level: 1, worker_commission_rate_bps: 1000, worker_net: null,
  address_building: 'Tòa kiểm thử', address_unit: '701', address_floor: '7', address_district: 'q7',
  apartment_access_state: { exact_unit_released: false }, kael_worker_brief_guidance: null,
  photo_urls: [], completion_photo_urls: [], created_at: '2026-09-08T00:00:00Z',
  matched_at: '2026-09-08T00:05:00Z', payment_status: null }

function setup(overrides: Record<string, unknown> = {}, list = false, role: 'worker' | 'customer' = 'worker') {
  const row = { ...job, ...overrides }
  const client = makeSequenceClient([], {}, {
    jobs: [{ data: list ? [row] : row, error: null }],
    job_worker_candidates: [{ data: [], error: null }],
    profiles: [{ data: { full_name: 'Thợ kiểm thử', avatar_url: null }, error: null }],
    worker_profiles: [{ data: { total_jobs: 1, rating: 5 }, error: null }],
  })
  const handler = createMobileApiHandler({ authenticate: async () => ({ success: true,
    role, user: { id: role === 'worker' ? WORKER : CUSTOMER }, supabase: client,
    userSupabase: client, privilegedSupabase: client }), services: createEdgeServices({}) })
  return { client, run: () => handler(new Request(`https://edge.test/${list ? 'workers/me/jobs' : `jobs/${JOB}`}`)) }
}

describe('worker brief read-time recovery', () => {
  installEdgeRuntimeTestHooks()

  it('recovers job detail after the confirmation process ended without persisting guidance', async () => {
    const { run, client } = setup()
    const response = await run()
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    const body = await response.json()
    expect(body.job.kael_worker_brief_guidance, pillarWhy(PILLAR)).toMatchObject({
      schema_version: 'worker_brief_output.v1', brief: { stage: 'guidance', problem_summary: 'Rò nước',
        full_address: { building: 'Tòa kiểm thử', unit: null, floor: null },
        estimated_earning_min: 180_000, estimated_earning_max: 180_000 } })
    expect(client.calls.some(call => call.operations.some(op => op[0] === 'update'))).toBe(false)
    const select = client.calls.find(call => call.table === 'jobs')?.operations.find(op => op[0] === 'select')?.[1]
    expect(String(select).split(',').map(field => field.trim())).toContain('quote_mode')
  })

  it('ignores stale cached guidance in the worker list and uses the same frozen price as detail', async () => {
    const { run } = setup({ kael_worker_brief_guidance: { brief: {
      full_address: { unit: 'OLD-SECRET' }, estimated_earning_max: 999_999 } } }, true)
    const response = await run()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.jobs[0].worker_brief_guidance, pillarWhy(PILLAR)).toMatchObject({
      schema_version: 'worker_brief_output.v1', brief: { full_address: { unit: null, floor: null },
        estimated_earning_min: 180_000, estimated_earning_max: 180_000 } })
    expect(JSON.stringify(body)).not.toContain('OLD-SECRET')
  })

  it.each(['rfq', 'inspection_only'])('does not invent earnings from stale Kael prices in %s detail', async quote_mode => {
    const { run } = setup({ quote_mode, final_price: null })
    const response = await run()
    expect(response.status).toBe(200)
    expect((await response.json()).job.kael_worker_brief_guidance.brief, pillarWhy(PILLAR)).toMatchObject({
      estimated_earning_min: null, estimated_earning_max: null })
  })

  it.each([false, true])('does not release an old assignee check-in in detail/list=%s', async list => {
    const { run } = setup({ apartment_access_state: { exact_unit_released: true, customer_authorized: true,
      check_in: { worker_id: CUSTOMER } } }, list)
    const response = await run()
    expect(response.status).toBe(200)
    const body = await response.json()
    const result = list ? body.jobs[0] : body.job
    const brief = list ? result.worker_brief_guidance : result.kael_worker_brief_guidance
    expect(result.address_unit, pillarWhy(PILLAR, 'old assignee authorization must not transfer')).toBeNull()
    expect(brief.brief.full_address.unit).toBeNull()
    expect(result.address_access.exact_unit_released).toBe(false)
  })

  it('retains valid Customer-authorized access for the current worker', async () => {
    const { run } = setup({ status: 'arrived', apartment_access_state: {
      exact_unit_released: true, customer_authorized: true, check_in: { worker_id: WORKER } } })
    const response = await run()
    expect(response.status).toBe(200)
    const result = (await response.json()).job
    expect(result.address_unit).toBe('701')
    expect(result.kael_worker_brief_guidance.brief.full_address.unit).toBe('701')
  })

  it('does not resurrect old address access or guidance on a cancelled job', async () => {
    const { run } = setup({ status: 'cancelled', apartment_access_state: {
      exact_unit_released: true, customer_authorized: true, check_in: { worker_id: WORKER } } })
    const response = await run()
    expect(response.status).toBe(200)
    const result = (await response.json()).job
    expect(result.address_unit, pillarWhy(PILLAR)).toBeNull()
    expect(result.address_building).toBeNull()
    expect(result.kael_worker_brief_guidance).toBeNull()
  })

  it('restores guidance for the worker assistant without selecting an exact address', async () => {
    const { client } = setup()
    const ctx = { success: true as const, role: 'worker' as const, user: { id: WORKER }, supabase: client }
    const restored = await requireWorkerKaelChatJob(db(ctx), ctx, JOB)
    expect(restored.kael_worker_brief_guidance, pillarWhy(PILLAR)).toMatchObject({
      brief: { stage: 'guidance', estimated_earning_max: 180_000 } })
    const columns = String(client.calls.find(call => call.table === 'jobs')?.operations.find(op => op[0] === 'select')?.[1])
      .split(',').map(field => field.trim())
    expect(columns).toEqual(expect.arrayContaining(['quote_mode', 'final_price', 'worker_commission_rate_bps']))
    expect(columns).not.toContain('address_unit')
    expect(columns).not.toContain('address_building')
  })

  it.each(['rfq', 'inspection_only'])('keeps %s worker list unpriced before the final price agreement', async quote_mode => {
    const { run } = setup({ quote_mode, final_price: null }, true)
    const response = await run()
    expect(response.status).toBe(200)
    const result = (await response.json()).jobs[0]
    expect(result.worker_brief_guidance.brief).toMatchObject({ estimated_earning_min: null, estimated_earning_max: null })
  })

  it('does not return Worker-only guidance to the Customer', async () => {
    const { run } = setup({ kael_worker_brief_guidance: { secret: 'WORKER-INTERNAL' } }, false, 'customer')
    const response = await run()
    expect(response.status).toBe(200)
    expect((await response.json()).job.kael_worker_brief_guidance).toBeNull()
  })

  it('denies a previous worker before reconstructing any brief', async () => {
    const { run, client } = setup({ worker_id: CUSTOMER })
    const response = await run()
    expect(response.status).toBe(404)
    expect(client.calls.filter(call => !call.table.startsWith('rpc:'))).toHaveLength(1)
  })

  it('keeps the frozen commission independent of the current worker tier and preserves validated core safety', async () => {
    const { run } = setup({ kael_worker_brief_core: { schema_version: 'worker_brief_output.v1', brief: {
      schema_version: 'worker_brief.v1', service_type: 'plumbing', sections: { safety: ['Khóa van nước trước khi kiểm tra.'] } } } }, true)
    const response = await run()
    expect(response.status).toBe(200)
    const brief = (await response.json()).jobs[0].worker_brief_guidance.brief
    expect(brief.sections.safety).toContain('Khóa van nước trước khi kiểm tra.')
    expect(brief.estimated_earning_max).toBe(180_000)
  })
})
