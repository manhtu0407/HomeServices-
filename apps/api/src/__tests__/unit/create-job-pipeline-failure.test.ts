import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { JobCreateInput } from '@nestscout/shared'

const mocks = vi.hoisted(() => ({
  runKaelPipeline: vi.fn(),
}))

vi.mock('@/lib/kael/pipeline', () => ({
  runKaelPipeline: mocks.runKaelPipeline,
}))

vi.mock('@/lib/db/query', () => ({
  withDbTimeout: vi.fn(<T>(promise: PromiseLike<T>) => promise),
}))

import { createJobWithEstimate } from '@/lib/jobs/create-job'

const INPUT: JobCreateInput = {
  service_type: 'plumbing',
  problem_chips: ['pipe_leak'],
  description: 'Pipe leak under the sink',
  photo_urls: [],
  address_district: 'q7',
}

describe('createJobWithEstimate pipeline failure cleanup', () => {
  beforeEach(() => {
    mocks.runKaelPipeline.mockReset()
  })

  it('rejects customer job creation without a concrete HCMC district before insert', async () => {
    const supabase = makeSequenceSupabase([])

    const result = await createJobWithEstimate(
      { ...INPUT, address_district: 'Ha Noi' },
      { id: 'customer-1', role: 'customer' },
      supabase as any,
    )

    expect(result).toMatchObject({
      success: false,
      code: 'VALIDATION',
      status: 400,
    })
    expect(supabase.calls).toHaveLength(0)
    expect(mocks.runKaelPipeline).not.toHaveBeenCalled()
  })

  it('cancels the analyzing job when Kael throws after job insert', async () => {
    mocks.runKaelPipeline.mockRejectedValueOnce(new Error('provider crashed'))
    const supabase = makeSequenceSupabase([
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
    ])

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await createJobWithEstimate(
      INPUT,
      { id: 'customer-1', role: 'customer' },
      supabase as any,
    )
    warnSpy.mockRestore()

    expect(result).toMatchObject({
      success: false,
      code: 'AI_FAILED',
      status: 502,
    })

    const cancelCall = supabase.calls.find((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update')
    )
    expect(cancelCall?.operations).toContainEqual([
      'update',
      expect.objectContaining({ status: 'cancelled', cancelled_at: expect.any(String) }),
    ])
    expect(cancelCall?.operations).toContainEqual(['eq', 'id', 'job-1'])
    expect(cancelCall?.operations).toContainEqual(['eq', 'status', 'analyzing'])
    expect(cancelCall?.operations).toContainEqual(['select', 'id'])
    expect(cancelCall?.operations).toContainEqual(['maybeSingle'])

    const failedEventCall = supabase.calls.find((call) =>
      call.table === 'job_events' &&
      call.operations.some((op) =>
        op[0] === 'insert' &&
        typeof op[1] === 'object' &&
        op[1] !== null &&
        'event_type' in op[1] &&
        op[1].event_type === 'kael_failed'
      )
    )
    expect(failedEventCall?.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        event_type: 'kael_failed',
        from_status: 'analyzing',
        to_status: 'cancelled',
        safe_metadata: { reason_code: 'PIPELINE_THROW' },
      }),
    ])
  })
})

type QueryResult = { data: unknown; error: { code?: string; message?: string } | null }
type QueryCall = { table: string; operations: unknown[][] }

function makeSequenceSupabase(results: QueryResult[]) {
  const calls: QueryCall[] = []
  return {
    calls,
    from(table: string) {
      const call: QueryCall = { table, operations: [] }
      calls.push(call)
      return makeQuery(call, results)
    },
  }
}

function makeQuery(call: QueryCall, results: QueryResult[]) {
  const query = {
    select(columns?: string) {
      call.operations.push(['select', columns])
      return query
    },
    insert(value: unknown) {
      call.operations.push(['insert', value])
      return query
    },
    update(value: unknown) {
      call.operations.push(['update', value])
      return query
    },
    eq(column: string, value: unknown) {
      call.operations.push(['eq', column, value])
      return query
    },
    single() {
      call.operations.push(['single'])
      return query
    },
    maybeSingle() {
      call.operations.push(['maybeSingle'])
      return query
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(results.shift() ?? { data: null, error: null }).then(onfulfilled, onrejected)
    },
  }
  return query
}
