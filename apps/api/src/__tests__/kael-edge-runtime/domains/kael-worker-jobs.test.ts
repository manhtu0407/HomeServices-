import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('worker-jobs', () => {
  installEdgeRuntimeTestHooks()

  it('restores the worker candidate-pending mission without assigning jobs.worker_id', async () => {
    const pendingJob = {
      id: 'job-candidate-pending',
      display_code: 'NS-PENDING-1',
      status: 'worker_candidate_pending',
      service_type: 'electrical',
      kael_problem_identified: 'Ổ cắm mất điện',
      address_building: 'Tòa S1.07',
      address_unit: '3701',
      address_floor: '37',
      address_district: 'Thủ Đức',
      apartment_access_profile: {},
      apartment_access_state: { release_stage: 'area_only', exact_unit_released: false },
      scheduled_at: '2026-07-22T06:00:00.000Z',
      kael_price_min: 150000,
      kael_price_max: 250000,
      kael_worker_brief_guidance: null,
      final_price: null,
      payment_status: null,
      photo_urls: [],
      completion_photo_urls: [],
      created_at: '2026-07-22T05:00:00.000Z',
      matched_at: null,
      completed_at: null,
    }
    const client = makeSequenceClient([
      { data: [], error: null },
      {
        data: [{ job_id: pendingJob.id, jobs: pendingJob }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-candidate' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).listWorkerJobs(ctx)).resolves.toMatchObject({
      jobs: [{
        id: pendingJob.id,
        status: 'worker_candidate_pending',
        address_building: null,
        address_unit: null,
        address_floor: null,
        district: 'Thủ Đức',
      }],
    })
    expect(client.calls.filter((call) => !call.table.startsWith('rpc:')).map((call) => call.table))
      .toEqual(['jobs', 'job_worker_candidates'])
    const candidateJobsCall = client.calls.find((call) => call.table === 'job_worker_candidates')
    expect(candidateJobsCall?.operations).toContainEqual(['eq', 'worker_id', 'worker-candidate'])
    expect(candidateJobsCall?.operations).toContainEqual(['eq', 'status', 'proposed'])
    expect(candidateJobsCall?.operations).toContainEqual(['eq', 'jobs.status', 'worker_candidate_pending'])
    expect(candidateJobsCall?.operations).toContainEqual(['gt', 'expires_at', expect.any(String)])
  })

  it('keeps manual bank payment jobs readable in the worker list', async () => {
    const client = makeSequenceClient([{
      data: [{
        id: 'job-manual-payment',
        display_code: 'NS-2026-000321',
        status: 'worker_matched',
        service_type: 'handyman',
        address_district: 'q7',
        apartment_access_profile: {},
        apartment_access_state: { release_stage: 'building_released', exact_unit_released: false },
        payment_status: 'manual_qr_ready',
        photo_urls: [],
        completion_photo_urls: [],
        created_at: '2026-08-12T00:00:00.000Z',
        matched_at: '2026-08-12T00:05:00.000Z',
      }],
      error: null,
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-manual-payment' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).listWorkerJobs(ctx)).resolves.toMatchObject({
      jobs: [{
        id: 'job-manual-payment',
        payment_status: 'manual_qr_ready',
      }],
    })
  })

  it('fails closed when a worker job contains an unsupported payment status', async () => {
    const client = makeSequenceClient([{
      data: [{
        id: 'job-invalid-payment',
        display_code: 'NS-2026-000322',
        status: 'worker_matched',
        service_type: 'plumbing',
        address_district: 'q7',
        apartment_access_profile: {},
        apartment_access_state: { release_stage: 'building_released', exact_unit_released: false },
        payment_status: 'provider_unknown_state',
        photo_urls: [],
        completion_photo_urls: [],
        created_at: '2026-07-15T00:00:00.000Z',
      }],
      error: null,
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).listWorkerJobs(ctx)).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('P9 keeps worker_on_way silent for the customer notification budget', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_matched',
          customer_id: 'customer-p9-silent',
          worker_id: 'worker-1',
        },
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).updateJobStatus(ctx, 'job-1', {
      status: 'worker_on_way',
    })).resolves.toMatchObject({
      job_id: 'job-1',
      from_status: 'worker_matched',
      to_status: 'worker_on_way',
    })

    expect(client.calls.some((call) => call.table === 'rpc:insert_notification_atomic')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('limits worker "Hỏi Kael thêm" to three questions per job and logs sanitized answers', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'worker_matched',
          worker_id: 'worker-1',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          description: 'Ống nước dưới lavabo bị rò',
          address_district: 'Quận 7',
          kael_problem_identified: 'Ống nước rò dưới lavabo',
          kael_complexity: 'medium',
          kael_price_min: 250000,
          kael_price_max: 450000,
          kael_worker_brief_core: null,
          kael_worker_brief_guidance: null,
        },
        error: null,
      },
      {
        data: [{
          ok: true,
          qa_id: 'qa-3',
          remaining_questions: 0,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    const result = await createEdgeServices({}).askKaelForWorker(ctx, 'job-1', {
      question: 'Khách có SĐT 0901234567, tôi có nên báo thêm 300.000 VND không?',
    })

    expect(result).toMatchObject({
      qa_id: 'qa-3',
      job_id: 'job-1',
      remaining_questions: 0,
    })
    expect(JSON.stringify(result.answer)).not.toContain('0901234567')
    expect(JSON.stringify(result.answer).toLowerCase()).not.toContain('vnd')

    const recordCall = client.calls.find((call) =>
      call.table === 'rpc:record_worker_kael_qa_atomic'
    )
    expect(recordCall?.operations).toContainEqual([
      'rpc',
      'record_worker_kael_qa_atomic',
      expect.objectContaining({
        p_job_id: 'job-1',
        p_worker_id: 'worker-1',
        p_question: expect.not.stringContaining('0901234567'),
      }),
    ])
  })
})
