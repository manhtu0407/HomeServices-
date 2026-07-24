import { describe, expect, it } from 'vitest'

import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'
import {
  listWorkerBroadcasts,
  listWorkerJobs,
} from '../../../../../supabase/functions/mobile-api/_shared/services/workers.service'

type QueryResult = {
  data: unknown
  error: { code?: string; message?: string } | null
}

type QueryCall = {
  operations: unknown[][]
  table: string
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
  return {
    calls,
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

describe('worker evidence privacy and stage projection', () => {
  it('returns only the customer evidence count before confirmation', async () => {
    const privateRef = 'supabase://job-media/11111111-1111-4111-8111-111111111111/before/private.jpg'
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    const client = makeSequenceClient([
      { data: null, error: null },
      {
        data: [{
          expires_at: expiresAt,
          id: 'broadcast-1',
          job_id: '11111111-1111-4111-8111-111111111111',
          jobs: {
            address_district: 'q7',
            kael_price_max: 300_000,
            kael_price_min: 200_000,
            kael_problem_identified: 'Ổ cắm chập chờn',
            photo_urls: [privateRef],
            service_type: 'electrical',
            status: 'broadcasting',
          },
          sent_at: '2026-07-23T00:00:00.000Z',
          status: 'sent',
        }],
        error: null,
      },
    ])

    const result = await listWorkerBroadcasts(workerContext(client))

    expect(result.broadcasts[0]).toMatchObject({ media_count: 1 })
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
})
