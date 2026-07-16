import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobCreateInput } from '@nestscout/shared'

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  runKaelPipeline: vi.fn(),
  logJobEvent: vi.fn(async () => undefined),
  logApiCalls: vi.fn(async () => undefined),
}))

vi.mock('@/lib/kael/pipeline', () => ({
  runKaelPipeline: mocks.runKaelPipeline,
}))

vi.mock('@/lib/jobs/event-log', () => ({
  logJobEvent: mocks.logJobEvent,
}))

vi.mock('@/lib/kael/log-api-call', () => ({
  generateRequestId: () => 'request-id',
  logApiCalls: mocks.logApiCalls,
}))

vi.mock('@/lib/db/query', () => ({
  withDbTimeout: vi.fn(<T>(promise: PromiseLike<T>) => promise),
}))

vi.mock('@/lib/rate-limit', () => ({
  AI_SESSION_LIMIT: { maxTokens: 10, refillIntervalMs: 60_000, refillRate: 1 },
  checkRateLimit: mocks.checkRateLimit,
}))

import { createJobWithEstimate } from '@/lib/jobs/create-job'

const CLIENT_REQUEST_ID = '00000000-0000-4000-8000-000000000001'
const INPUT: JobCreateInput = {
  service_type: 'plumbing',
  problem_chips: ['pipe_leak'],
  description: 'Ống nước dưới bồn rửa đang bị rò rỉ.',
  photo_urls: [],
  address_building: 'Chung cư Sunrise',
  address_district: 'Quận 7',
  apartment_access_profile: {
    entry_method: '  Đăng ký tại quầy lễ tân  ',
    guard_note: 'Gọi em qua Zalo 0901234567',
    building_note: '  ',
  },
  client_request_id: CLIENT_REQUEST_ID,
}

const ESTIMATE = {
  service_type: 'plumbing',
  problem_category: 'pipe_leak',
  problem_summary: 'Rò rỉ đường ống dưới bồn rửa',
  complexity: 'medium',
  price_min: 250_000,
  price_max: 450_000,
  confidence: 0.86,
  advisory: 'Khóa van nếu nước chảy mạnh.',
  disclaimer: 'Khoảng giá có thể thay đổi sau kiểm tra tại chỗ.',
} as const

const EXISTING_JOB = {
  id: 'job-existing',
  status: 'awaiting_customer_confirm',
  service_type: 'plumbing',
  kael_problem_identified: ESTIMATE.problem_summary,
  kael_complexity: ESTIMATE.complexity,
  kael_price_min: ESTIMATE.price_min,
  kael_price_max: ESTIMATE.price_max,
  kael_advisory: ESTIMATE.advisory,
  kael_estimate_card_v3: {
    estimate: ESTIMATE,
    fallback_used: false,
  },
}

describe('createJobWithEstimate idempotency and apartment access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkRateLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 })
    mocks.runKaelPipeline.mockResolvedValue({
      success: true,
      estimate: ESTIMATE,
      serviceProblemId: 'problem-1',
      fallbackUsed: false,
      stageLogs: [],
    })
  })

  it('persists the request key, sanitized access data, initial state, and retry snapshot', async () => {
    const supabase = makeSequenceSupabase([
      { data: null, error: null },
      { data: { id: 'job-new' }, error: null },
      { data: { id: 'job-new' }, error: null },
    ])

    const result = await createJobWithEstimate(
      INPUT,
      { id: 'customer-1', role: 'customer' },
      supabase as never,
    )

    expect(result).toMatchObject({ success: true, jobId: 'job-new' })
    const insert = operationValue(supabase.calls, 'jobs', 'insert')
    expect(insert).toMatchObject({
      client_request_id: CLIENT_REQUEST_ID,
      apartment_access_profile: {
        entry_method: 'Đăng ký tại quầy lễ tân',
      },
      apartment_access_state: {
        release_stage: 'area_only',
        exact_unit_released: false,
        check_in_required: true,
        identity_check_required: true,
        customer_handoff_required: true,
        evidence_mode: 'none',
      },
    })
    expect(insert).not.toHaveProperty('apartment_access_profile.guard_note')
    expect(insert).not.toHaveProperty('apartment_access_profile.building_note')

    const update = operationValue(supabase.calls, 'jobs', 'update')
    expect(update).toMatchObject({
      kael_estimate_card_v3: {
        estimate: ESTIMATE,
        fallback_used: false,
      },
    })
  })

  it('returns the stored response for a repeated request without insert or AI work', async () => {
    const supabase = makeSequenceSupabase([{ data: EXISTING_JOB, error: null }])

    const result = await createJobWithEstimate(
      INPUT,
      { id: 'customer-1', role: 'customer' },
      supabase as never,
    )

    expect(result).toEqual({
      success: true,
      jobId: 'job-existing',
      status: 'awaiting_customer_confirm',
      estimate: ESTIMATE,
      fallbackUsed: false,
    })
    expect(supabase.calls.some((call) => hasOperation(call, 'insert'))).toBe(false)
    expect(mocks.runKaelPipeline).not.toHaveBeenCalled()
    expect(mocks.checkRateLimit).not.toHaveBeenCalled()
  })

  it('recovers the winning row after a concurrent unique-key conflict', async () => {
    const supabase = makeSequenceSupabase([
      { data: null, error: null },
      { data: null, error: { code: '23505' } },
      { data: EXISTING_JOB, error: null },
    ])

    const result = await createJobWithEstimate(
      INPUT,
      { id: 'customer-1', role: 'customer' },
      supabase as never,
    )

    expect(result).toMatchObject({ success: true, jobId: 'job-existing' })
    expect(mocks.runKaelPipeline).not.toHaveBeenCalled()
    expect(supabase.calls.filter((call) => hasOperation(call, 'insert'))).toHaveLength(1)
  })

  it('rejects a newly submitted past schedule before inserting', async () => {
    const supabase = makeSequenceSupabase([])

    const result = await createJobWithEstimate(
      { ...INPUT, client_request_id: undefined, scheduled_at: '2020-01-01T00:00:00.000Z' },
      { id: 'customer-1', role: 'customer' },
      supabase as never,
    )

    expect(result).toMatchObject({ success: false, code: 'VALIDATION', status: 400 })
    expect(supabase.calls).toHaveLength(0)
    expect(mocks.runKaelPipeline).not.toHaveBeenCalled()
  })

  it('rate-limits only after proving the request is not an idempotent replay', async () => {
    mocks.checkRateLimit.mockReturnValueOnce({ allowed: false, retryAfterMs: 60_000 })
    const supabase = makeSequenceSupabase([{ data: null, error: null }])

    const result = await createJobWithEstimate(
      INPUT,
      { id: 'customer-1', role: 'customer' },
      supabase as never,
    )

    expect(result).toMatchObject({ success: false, code: 'RATE_LIMITED', status: 429 })
    expect(supabase.calls.some((call) => hasOperation(call, 'insert'))).toBe(false)
    expect(mocks.runKaelPipeline).not.toHaveBeenCalled()
  })

  it('releases the request key when the AI pipeline fails terminally', async () => {
    mocks.runKaelPipeline.mockResolvedValue({
      success: false,
      code: 'AI_FAILED',
      error: 'provider unavailable',
      stageLogs: [],
    })
    const supabase = makeSequenceSupabase([
      { data: null, error: null },
      { data: { id: 'job-new' }, error: null },
      { data: { id: 'job-new' }, error: null },
    ])

    const result = await createJobWithEstimate(
      INPUT,
      { id: 'customer-1', role: 'customer' },
      supabase as never,
    )

    expect(result).toMatchObject({ success: false, code: 'AI_FAILED' })
    const cleanup = supabase.calls
      .filter((call) => call.table === 'jobs' && hasOperation(call, 'update'))
      .at(-1)
    expect(cleanup?.operations).toContainEqual([
      'update',
      expect.objectContaining({ status: 'cancelled', client_request_id: null }),
    ])
  })

  it('retires the analyzing shell when the estimate update fails', async () => {
    const supabase = makeSequenceSupabase([
      { data: null, error: null },
      { data: { id: 'job-new' }, error: null },
      { data: null, error: { code: 'ESTIMATE_WRITE_FAILED' } },
      { data: { id: 'job-new' }, error: null },
    ])

    const result = await createJobWithEstimate(
      INPUT,
      { id: 'customer-1', role: 'customer' },
      supabase as never,
    )

    expect(result).toMatchObject({ success: false, code: 'DB_ERROR' })
    const updates = supabase.calls
      .filter((call) => call.table === 'jobs' && hasOperation(call, 'update'))
    expect(updates).toHaveLength(2)
    expect(updates[1]?.operations).toContainEqual([
      'update',
      expect.objectContaining({ status: 'cancelled', client_request_id: null }),
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

function hasOperation(call: QueryCall, name: string) {
  return call.operations.some((operation) => operation[0] === name)
}

function operationValue(calls: QueryCall[], table: string, name: string) {
  const call = calls.find((candidate) => candidate.table === table && hasOperation(candidate, name))
  return call?.operations.find((operation) => operation[0] === name)?.[1]
}
