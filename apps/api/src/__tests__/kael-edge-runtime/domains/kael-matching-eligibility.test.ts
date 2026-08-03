import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient, quoteReadyPlumbingDiagnosisScope } from '../harness'

describe('matching-eligibility', () => {
  installEdgeRuntimeTestHooks()

  it('keeps service-qualified legacy workers eligible when granular capabilities are empty', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { customer_id: 'customer-1', address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null, diagnosis_scope: quoteReadyPlumbingDiagnosisScope() }, error: null },
      { data: [], error: null },
      { data: [{ id: 'worker-legacy', rating: 4.8, total_jobs: 12, service_types: ['plumbing'], districts: ['q7'], problem_specializations: [] }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ id: 'broadcast-1', worker_id: 'worker-legacy' }], error: null },
      { data: [{ notification_id: 'notification-1' }], error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: true,
    })

    const workerQuery = client.calls.find((call) => call.table === 'worker_profiles')
    expect(workerQuery?.operations).toContainEqual(['contains', 'selected_service_types', ['plumbing']])
    const activation = client.calls.find((call) =>
      call.table === 'rpc:activate_job_broadcast_batch_atomic'
    )
    expect(activation?.operations).toContainEqual([
      'rpc',
      'activate_job_broadcast_batch_atomic',
      expect.objectContaining({ p_job_id: 'job-1', p_worker_ids: ['worker-legacy'] }),
    ])
  })

  it('excludes only the worker whose selected service is temporarily quality-locked', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { customer_id: 'customer-1', address_lat: null, address_lng: null, problem_chips: [], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [], error: null },
      {
        data: [
          { id: 'worker-locked', rating: 4.9, total_jobs: 30, selected_service_types: ['plumbing'], districts: ['q7'] },
          { id: 'worker-open', rating: 4.7, total_jobs: 12, selected_service_types: ['plumbing'], districts: ['q7'] },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ id: 'broadcast-1', worker_id: 'worker-open' }], error: null },
      { data: [{ notification_id: 'notification-1' }], error: null },
      { data: [], error: null },
      { data: null, error: null },
    ], {}, {
      worker_service_quality_status: [{
        data: [{
          worker_id: 'worker-locked',
          is_locked: true,
          locked_until: '2099-07-23T00:00:00.000Z',
        }],
        error: null,
      }],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: true,
    })

    const qualityCall = client.calls.find((call) =>
      call.table === 'worker_service_quality_status'
    )
    expect(qualityCall?.operations).toContainEqual(['eq', 'service_type', 'plumbing'])
    const activation = client.calls.find((call) =>
      call.table === 'rpc:activate_job_broadcast_batch_atomic'
    )
    expect(activation?.operations).toContainEqual([
      'rpc',
      'activate_job_broadcast_batch_atomic',
      expect.objectContaining({ p_job_id: 'job-1', p_worker_ids: ['worker-open'] }),
    ])
  })

  it('still rejects an explicitly mismatched granular worker capability', async () => {
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { customer_id: 'customer-1', address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null, diagnosis_scope: quoteReadyPlumbingDiagnosisScope() }, error: null },
      { data: [], error: null },
      { data: [{ id: 'worker-mismatch', rating: 4.9, total_jobs: 30, service_types: ['plumbing'], districts: ['q7'], problem_specializations: ['drain_clearing'] }], error: null },
      { data: null, error: null },
      { data: [{ notification_id: 'notification-1' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: false,
      worker: null,
    })
    expect(client.calls.some((call) =>
      call.table === 'rpc:activate_job_broadcast_batch_atomic'
    )).toBe(false)
  })

  it('continues past a full ineligible worker page instead of hiding a later eligible worker', async () => {
    const mismatchedWorkers = Array.from({ length: 50 }, (_, index) => ({
      id: `worker-mismatch-${index}`,
      rating: 5,
      total_jobs: 100 - index,
      service_types: ['plumbing'],
      districts: ['q7'],
      problem_specializations: ['drain_clearing'],
    }))
    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { customer_id: 'customer-1', address_lat: null, address_lng: null, problem_chips: ['pipe_leak'], service_problem_id: null, kael_problem_identified: null, diagnosis_scope: quoteReadyPlumbingDiagnosisScope() }, error: null },
      { data: [], error: null },
      { data: mismatchedWorkers, error: null },
      { data: [{ id: 'worker-eligible', rating: 4.7, total_jobs: 12, service_types: ['plumbing'], districts: ['q7'], problem_specializations: ['water_leak_diagnosis'] }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ id: 'broadcast-1', worker_id: 'worker-eligible' }], error: null },
      { data: [{ notification_id: 'notification-1' }], error: null },
      { data: [], error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: true,
    })

    const workerQueries = client.calls.filter((call) => call.table === 'worker_profiles')
    expect(workerQueries).toHaveLength(2)
    expect(workerQueries[0]?.operations).toContainEqual(['range', 0, 49])
    expect(workerQueries[1]?.operations).toContainEqual(['range', 50, 99])
    const activation = client.calls.find((call) =>
      call.table === 'rpc:activate_job_broadcast_batch_atomic'
    )
    expect(activation?.operations).toContainEqual([
      'rpc',
      'activate_job_broadcast_batch_atomic',
      expect.objectContaining({ p_job_id: 'job-1', p_worker_ids: ['worker-eligible'] }),
    ])
  })

  it('soft-deprioritizes a high-disintermediation-risk worker in matching without excluding them (§32.6)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { customer_id: 'customer-1', address_lat: null, address_lng: null, problem_chips: [], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [], error: null },
      {
        data: [
          // worker-risky would win the tie-break (more jobs) without the penalty.
          { id: 'worker-risky', rating: 4.8, total_jobs: 30, service_types: ['plumbing'], districts: ['q7'] },
          { id: 'worker-clean', rating: 4.8, total_jobs: 12, service_types: ['plumbing'], districts: ['q7'] },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ worker_id: 'worker-risky', red_flags: { disintermediation_risk_count: 3 } }], error: null },
      { data: [{ id: 'broadcast-1', worker_id: 'worker-clean' }, { id: 'broadcast-2', worker_id: 'worker-risky' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: true,
    })

    const riskCall = client.calls.find((call) => call.table === 'worker_kael_memory')
    expect(riskCall?.operations).toContainEqual(['select', 'worker_id, red_flags'])
    const activationOp = client.calls.find((call) =>
      call.table === 'rpc:activate_job_broadcast_batch_atomic'
    )?.operations.find((op) => op[0] === 'rpc')
    const insertedWorkers = (activationOp?.[2] as { p_worker_ids?: string[] } | undefined)?.p_worker_ids
    // Penalty: equal-rating clean worker ranks first; risky worker is demoted, NOT excluded.
    expect(insertedWorkers).toEqual(['worker-clean', 'worker-risky'])
  })

  it('does not penalize matching rank for a single weak disintermediation signal (§32.6)', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      { data: { id: 'job-1', status: 'awaiting_customer_confirm', customer_id: 'customer-1', service_type: 'plumbing', address_district: 'q7', kael_price_max: 250000, final_price: null }, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { customer_id: 'customer-1', address_lat: null, address_lng: null, problem_chips: [], service_problem_id: null, kael_problem_identified: null }, error: null },
      { data: [], error: null },
      {
        data: [
          { id: 'worker-risky', rating: 4.8, total_jobs: 30, service_types: ['plumbing'], districts: ['q7'] },
          { id: 'worker-clean', rating: 4.8, total_jobs: 12, service_types: ['plumbing'], districts: ['q7'] },
        ],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
      { data: [{ worker_id: 'worker-risky', red_flags: { disintermediation_risk_count: 1 } }], error: null },
      { data: [{ id: 'broadcast-1', worker_id: 'worker-risky' }, { id: 'broadcast-2', worker_id: 'worker-clean' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).confirmSearch(ctx, 'job-1')).resolves.toMatchObject({
      job_id: 'job-1',
      status: 'broadcasting',
      broadcast_sent: true,
    })

    const activationOp = client.calls.find((call) =>
      call.table === 'rpc:activate_job_broadcast_batch_atomic'
    )?.operations.find((op) => op[0] === 'rpc')
    const insertedWorkers = (activationOp?.[2] as { p_worker_ids?: string[] } | undefined)?.p_worker_ids
    // Below the threshold (count 1 < 2) the ranking is untouched.
    expect(insertedWorkers).toEqual(['worker-risky', 'worker-clean'])
  })
})
