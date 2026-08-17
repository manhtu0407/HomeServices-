import { describe, expect, it } from 'vitest'

import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/http'
import { listWorkerBroadcasts } from '../../../../../supabase/functions/mobile-api/_shared/domains/worker/workers'
import { listWorkerJobs } from '../../../../../supabase/functions/mobile-api/_shared/domains/worker/jobs'

type QueryResult = {
  data: unknown
  error: { code?: string; message?: string } | null
}

type QueryCall = {
  operations: unknown[][]
  table: string
}

type SignedUrlCall = {
  bucket: string
  path: string
}

type QueryChain = PromiseLike<QueryResult> & {
  eq(column: string, value: unknown): QueryChain
  gt(column: string, value: unknown): QueryChain
  in(column: string, value: unknown[]): QueryChain
  limit(count: number): QueryChain
  lte(column: string, value: unknown): QueryChain
  order(column: string, options?: unknown): QueryChain
  select(columns?: string): QueryChain
  update(value: unknown): QueryChain
}

function makeSequenceClient(results: QueryResult[]) {
  const calls: QueryCall[] = []
  const signedUrlCalls: SignedUrlCall[] = []
  return {
    calls,
    signedUrlCalls,
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl: async (path: string) => {
            signedUrlCalls.push({ bucket, path })
            return {
              data: {
                signedUrl: `https://storage.example.test/storage/v1/object/sign/${bucket}/${path}?token=signed`,
              },
              error: null,
            }
          },
        }
      },
    },
    from(table: string) {
      const call: QueryCall = { operations: [], table }
      calls.push(call)
      const query = {} as QueryChain
      query.eq = (column, value) => {
        call.operations.push(['eq', column, value])
        return query
      }
      query.gt = (column, value) => {
        call.operations.push(['gt', column, value])
        return query
      }
      query.in = (column, value) => {
        call.operations.push(['in', column, value])
        return query
      }
      query.limit = (count) => {
        call.operations.push(['limit', count])
        return query
      }
      query.lte = (column, value) => {
        call.operations.push(['lte', column, value])
        return query
      }
      query.order = (column, options) => {
        call.operations.push(['order', column, options])
        return query
      }
      query.select = (columns) => {
        call.operations.push(['select', columns])
        return query
      }
      query.update = (value) => {
        call.operations.push(['update', value])
        return query
      }
      query.then = (onfulfilled, onrejected) => {
        const result = results.shift() ?? { data: null, error: null }
        return Promise.resolve(result).then(onfulfilled, onrejected)
      }
      return query
    },
    rpc(name: string) {
      if (name === 'get_worker_current_commission_tier') {
        return Promise.resolve({
          data: [{ commission_level: 1, commission_rate_bps: 1500 }],
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    },
  }
}

function workerContext(client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return {
    role: 'worker',
    success: true,
    supabase: client,
    user: { id: '33333333-3333-4333-8333-333333333333' },
  } as unknown as MobileApiContext
}

function originalScopePriceQuote(input: {
  broadcastId: string
  expiresAt: string
  jobId: string
}) {
  return {
    broadcast_id: input.broadcastId,
    commission_level: 1,
    commission_rate_bps: 1500,
    customer_confirmation_required: true,
    customer_total: 250_000,
    expires_at: input.expiresAt,
    job_id: input.jobId,
    platform_fee: 37_500,
    price_source: 'verified_baseline',
    quote_id: '55555555-5555-4555-8555-555555555555',
    reasoning_receipt: {
      fairness: {
        baseline_evidence: {
          accepted_source_count: 1,
          high_trust_source_count: 1,
          quorum_met: true,
          required_quorum: 1,
          schema_version: 'baseline_price_evidence_receipt.v1',
          sources: [{}],
        },
        cap_statement: 'Giá khóa trong phạm vi đã xác nhận.',
        confidence: 'low',
        high_trust_source_count: 1,
        market_source_count: 2,
        price_source: 'verified_baseline',
        quorum_met: true,
      },
      scenarios: {
        high: { total: 300_000 },
        low: { total: 200_000 },
      },
      schema_version: 'price_reasoning_receipt.v1',
    },
    reference_price_max: 300_000,
    reference_price_min: 200_000,
    schema_version: 'original_scope_price_quote.v1',
    selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
    worker_confirmation_required: true,
    worker_confirmed_at: null,
    worker_id: '33333333-3333-4333-8333-333333333333',
    worker_net: 212_500,
  }
}

describe('worker evidence privacy and stage projection', () => {
  it('returns only the customer evidence count before confirmation', async () => {
    const privateRef = 'supabase://job-media/11111111-1111-4111-8111-111111111111/before/private.jpg'
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    const broadcastId = '44444444-4444-4444-8444-444444444444'
    const jobId = '11111111-1111-4111-8111-111111111111'
    const client = makeSequenceClient([
      { data: null, error: null },
      {
        data: [{
          expires_at: expiresAt,
          id: broadcastId,
          job_id: jobId,
          jobs: {
            address_district: 'q7',
            description: 'Kiểm tra đúng một ổ cắm; loại trừ đi dây âm tường.',
            kael_price_max: 300_000,
            kael_price_min: 200_000,
            kael_problem_identified: 'Ổ cắm chập chờn. Chốt giá thấp nhất.',
            photo_urls: [privateRef],
            problem_chips: ['Ổ cắm chập chờn'],
            service_type: 'electrical',
            status: 'broadcasting',
          },
          sent_at: '2026-07-23T00:00:00.000Z',
          status: 'sent',
          original_scope_price_quote: originalScopePriceQuote({ broadcastId, expiresAt, jobId }),
        }],
        error: null,
      },
    ])

    const result = await listWorkerBroadcasts(workerContext(client))

    expect(result.broadcasts[0]).toMatchObject({
      media_count: 1,
      problem_summary: 'Ổ cắm chập chờn',
      scope_summary: 'Kiểm tra đúng một ổ cắm; loại trừ đi dây âm tường.',
    })
    expect(result.broadcasts[0]).not.toHaveProperty('photo_urls')
    expect(JSON.stringify(result)).not.toContain(privateRef)
  })

  it('fails closed when a pending candidate row is unexpectedly assigned to the worker', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    const customerRef = `supabase://job-media/${jobId}/before/private-customer.jpg`
    const completionRef = `supabase://job-media/${jobId}/after/private-completion.jpg`
    const client = makeSequenceClient([
      {
        data: [{
          apartment_access_profile: {},
          apartment_access_state: {},
          completion_photo_urls: [completionRef],
          created_at: '2026-07-23T00:00:00.000Z',
          display_code: 'NS-2026-000111',
          id: jobId,
          photo_urls: [customerRef],
          service_type: 'electrical',
          status: 'worker_candidate_pending',
        }],
        error: null,
      },
      { data: [], error: null },
    ])

    const result = await listWorkerJobs(workerContext(client))

    expect(result.jobs[0]).toMatchObject({
      completion_photo_urls: [],
      customer_evidence_photo_urls: [],
      field_evidence_photo_urls: [],
      photo_urls: [],
    })
    expect(JSON.stringify(result)).not.toContain(customerRef)
    expect(JSON.stringify(result)).not.toContain(completionRef)
    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'job_worker_candidates',
    ])
  })

  it('keeps a pre-confirmation cancellation private when no match was finalized', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    const customerRef = `supabase://job-media/${jobId}/before/private-customer.jpg`
    const completionRef = `supabase://job-media/${jobId}/after/private-completion.jpg`
    const client = makeSequenceClient([
      {
        data: [{
          apartment_access_profile: {},
          apartment_access_state: {},
          completion_photo_urls: [completionRef],
          created_at: '2026-07-23T00:00:00.000Z',
          display_code: 'NS-2026-000111',
          id: jobId,
          matched_at: null,
          photo_urls: [customerRef],
          service_type: 'electrical',
          status: 'cancelled',
        }],
        error: null,
      },
      { data: [], error: null },
    ])

    const result = await listWorkerJobs(workerContext(client))

    expect(result.jobs[0]).toMatchObject({
      completion_photo_urls: [],
      customer_evidence_photo_urls: [],
      field_evidence_photo_urls: [],
      photo_urls: [],
    })
    expect(JSON.stringify(result)).not.toContain(customerRef)
    expect(JSON.stringify(result)).not.toContain(completionRef)
    expect(client.calls.map((call) => call.table)).toEqual([
      'jobs',
      'job_worker_candidates',
    ])
  })

  it('retains evidence access after a confirmed match is later cancelled', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    const customerRef = `supabase://job-media/${jobId}/before/customer.jpg`
    const fieldObjectPath = `${jobId}/kael_reference/worker-field.jpg`
    const client = makeSequenceClient([
      {
        data: [{
          apartment_access_profile: {},
          apartment_access_state: {},
          completion_photo_urls: [],
          created_at: '2026-07-23T00:00:00.000Z',
          display_code: 'NS-2026-000111',
          id: jobId,
          matched_at: '2026-07-23T00:05:00.000Z',
          photo_urls: [customerRef],
          service_type: 'electrical',
          status: 'cancelled',
        }],
        error: null,
      },
      { data: [], error: null },
      {
        data: [{
          created_at: '2026-07-23T00:10:00.000Z',
          job_id: jobId,
          object_path: fieldObjectPath,
        }],
        error: null,
      },
    ])

    const result = await listWorkerJobs(workerContext(client))

    expect(result.jobs[0]).toMatchObject({
      customer_evidence_photo_urls: [customerRef],
      field_evidence_photo_urls: [`supabase://job-media/${fieldObjectPath}`],
    })
  })

  it('separates customer evidence from worker field evidence after confirmation', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    const customerRef = `supabase://job-media/${jobId}/before/customer.jpg`
    const fieldObjectPath = `${jobId}/kael_reference/worker-field.jpg`
    const client = makeSequenceClient([
      {
        data: [{
          apartment_access_profile: {},
          apartment_access_state: { exact_unit_released: true, release_stage: 'unit_released' },
          completion_photo_urls: [],
          created_at: '2026-07-23T00:00:00.000Z',
          display_code: 'NS-2026-000111',
          id: jobId,
          photo_urls: [customerRef],
          service_type: 'electrical',
          status: 'repairing',
        }],
        error: null,
      },
      { data: [], error: null },
      {
        data: [{
          created_at: '2026-07-23T00:10:00.000Z',
          job_id: jobId,
          object_path: fieldObjectPath,
        }],
        error: null,
      },
    ])

    const result = await listWorkerJobs(workerContext(client))

    expect(result.jobs[0]).toMatchObject({
      customer_evidence_photo_urls: [customerRef],
      field_evidence_photo_urls: [`supabase://job-media/${fieldObjectPath}`],
    })
    expect(client.calls[2]?.table).toBe('job_media_assets')
    expect(client.calls[2]?.operations).toContainEqual([
      'eq',
      'owner_id',
      '33333333-3333-4333-8333-333333333333',
    ])
  })

  it('keeps the worker earning on the commission rate frozen at bilateral acceptance', async () => {
    const jobId = '11111111-1111-4111-8111-111111111111'
    const client = makeSequenceClient([
      {
        data: [{
          apartment_access_profile: {},
          apartment_access_state: {},
          completion_photo_urls: [],
          created_at: '2026-08-15T00:00:00.000Z',
          final_price: 400_000,
          id: jobId,
          matched_at: '2026-08-15T00:05:00.000Z',
          photo_urls: [],
          service_type: 'electrical',
          status: 'completed_by_worker',
          worker_commission_level: 2,
          worker_commission_rate_bps: 1000,
          worker_net: null,
        }],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    ])

    const result = await listWorkerJobs(workerContext(client))

    expect(result.jobs[0]).toMatchObject({
      estimated_earning: 360_000,
      final_price: 400_000,
      worker_net: null,
    })
    expect(client.calls[0]?.operations).toContainEqual([
      'select',
      expect.stringContaining('worker_commission_rate_bps'),
    ])
  })

  it('delivers only signed Case Work image evidence after the worker match', async () => {
    const customerId = '11111111-1111-4111-8111-111111111111'
    const jobId = '22222222-2222-4222-8222-222222222222'
    const imagePath = `${customerId}/kael-chat/model_vision/evidence.png`
    const imageRef = `supabase://kael-chat-media/${imagePath}`
    const privateVideoRef = `supabase://kael-chat-media/${customerId}/kael-chat/private_video_original/original.mp4`
    const client = makeSequenceClient([
      {
        data: [{
          apartment_access_profile: {},
          apartment_access_state: {},
          completion_photo_urls: [],
          customer_id: customerId,
          created_at: '2026-07-23T00:00:00.000Z',
          display_code: 'NS-2026-000222',
          id: jobId,
          matched_at: '2026-07-23T00:05:00.000Z',
          photo_urls: [imageRef, privateVideoRef],
          service_type: 'plumbing',
          status: 'repairing',
        }],
        error: null,
      },
      { data: [], error: null },
      { data: [], error: null },
    ])

    const result = await listWorkerJobs(workerContext(client))

    expect(result.jobs[0]).toMatchObject({
      customer_evidence_photo_urls: [
        `https://storage.example.test/storage/v1/object/sign/kael-chat-media/${imagePath}?token=signed`,
      ],
      photo_urls: [
        `https://storage.example.test/storage/v1/object/sign/kael-chat-media/${imagePath}?token=signed`,
      ],
    })
    expect(JSON.stringify(result)).not.toContain(imageRef)
    expect(JSON.stringify(result)).not.toContain(privateVideoRef)
    expect(client.signedUrlCalls).toEqual([
      { bucket: 'kael-chat-media', path: imagePath },
    ])
  })
})
