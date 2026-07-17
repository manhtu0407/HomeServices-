import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createBroadcasts: vi.fn(),
  logJobEvent: vi.fn(async (..._args: unknown[]) => undefined),
  rollbackFailedBroadcastStart: vi.fn(),
  runKaelAutonomyOrchestrator: vi.fn(),
  runKaelPipeline: vi.fn(),
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/services/_shared.ts', () => ({
  estimatePriceSourceFromStageLogs: () => 'baseline',
  sourceTrustSecretsForRequest: (secrets: unknown) => secrets,
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/rate-limit.ts', () => ({
  AI_SESSION_LIMIT: { maxTokens: 10, refillIntervalMs: 60_000, refillRate: 1 },
  checkRateLimit: mocks.checkRateLimit,
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/services/apartment-access.service.ts', () => ({
  buildInitialApartmentAccessState: () => ({ release_stage: 'area_only' }),
  persistApartmentAccessProfileFromMetadata: vi.fn(async () => undefined),
  sanitizeApartmentAccessProfile: () => ({}),
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/services/places-geo.service.ts', () => ({
  geocodeJobAddressForMatching: vi.fn(async () => undefined),
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/services/broadcasts.service.ts', () => ({
  createBroadcasts: mocks.createBroadcasts,
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/services/matching.service.ts', () => ({
  rollbackFailedBroadcastStart: mocks.rollbackFailedBroadcastStart,
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/services/notifications.service.ts', () => ({
  insertUserNotification: vi.fn(async () => undefined),
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/services/audit.ts', () => ({
  apiLogPurposeForPipelineStage: () => 'job_analysis',
  logApiCalls: vi.fn(async () => undefined),
  logJobEvent: mocks.logJobEvent,
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/kael/index.ts', () => ({
  PRICE_DISCLAIMER: 'Estimate only',
  buildEstimateCardOutput: () => ({}),
  buildKaelAutonomyDecision: () => ({ resulting_event: 'kael_started_matching' }),
  buildWorkerBriefOutput: () => ({}),
  recordLearningRuleApplication: vi.fn(async () => undefined),
  resolveElectricalIntakeRuntime: () => ({
    enabled: false,
    safetySignals: [],
    hardRoute: null,
  }),
  runKaelAutonomyOrchestrator: mocks.runKaelAutonomyOrchestrator,
  runKaelPipeline: mocks.runKaelPipeline,
}))

vi.mock('../../../../../supabase/functions/mobile-api/_shared/router.ts', () => ({
  apiFailure: (code: string, message: string, status: number) => {
    throw Object.assign(new Error(message), { code, status })
  },
}))

import { createJob } from '../../../../../supabase/functions/mobile-api/_shared/services/jobs/create'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'

describe('mobile-api failed job-create retry recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.checkRateLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 })
    mocks.runKaelPipeline.mockResolvedValue({
      success: true,
      estimate: {
        advisory: null,
        complexity: 'medium',
        confidence: 0.8,
        market_signals: null,
        needs_inspection: false,
        needs_inspection_reason: null,
        price_max: 350_000,
        price_min: 150_000,
        problem_summary: 'Pipe leak under the sink',
      },
      fallbackUsed: false,
      learningApplications: [],
      serviceProblemId: 'pipe-leak',
      stageLogs: [],
    })
    mocks.runKaelAutonomyOrchestrator.mockResolvedValue({
      gate: { result: 'allow', audit: { safe_metadata: {} } },
    })
    mocks.createBroadcasts.mockResolvedValue({
      success: false,
      reasonCode: 'DB_ERROR',
      reason: 'broadcast insert failed',
    })
    mocks.rollbackFailedBroadcastStart.mockResolvedValue(true)
  })

  it('returns the database-generated display code for a newly created job', async () => {
    mocks.createBroadcasts.mockResolvedValueOnce({
      batchId: 'batch-1',
      broadcastCount: 1,
      success: true,
    })
    const client = recordingJobClient()
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createJob(ctx, {
      address_district: 'q7',
      description: 'Pipe leak under the sink',
      photo_urls: [],
      problem_chips: ['pipe_leak'],
      service_type: 'plumbing',
    }, {})).resolves.toMatchObject({
      display_code: 'NS-2026-000001',
      job_id: 'job-1',
    })
    expect(client.calls.find((call) =>
      call.table === 'jobs' && call.operations.some(([operation]) => operation === 'insert')
    )?.operations).toContainEqual(['select', 'id, display_code'])
  })

  it('cancels the rolled-back shell and releases its idempotency key after broadcast persistence fails', async () => {
    const client = recordingJobClient()
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createJob(ctx, {
      address_district: 'q7',
      client_request_id: 'c1000000-0000-4000-8000-000000000001',
      description: 'Pipe leak under the sink',
      photo_urls: [],
      problem_chips: ['pipe_leak'],
      service_type: 'plumbing',
    }, {})).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })

    expect(mocks.rollbackFailedBroadcastStart).toHaveBeenCalledWith(
      client,
      'job-1',
      'customer-1',
      'analyzing',
    )
    expect(client.jobUpdates).toContainEqual(expect.objectContaining({
      status: 'cancelled',
      client_request_id: null,
    }))
    expect(mocks.logJobEvent.mock.calls.filter(([, , eventType]) =>
      eventType === 'job_created'
    )).toHaveLength(1)
  })

  it('retires the analyzing shell when the mandatory autonomy audit fails', async () => {
    mocks.runKaelAutonomyOrchestrator.mockRejectedValueOnce(
      new Error('KAEL_AUTONOMY_AUDIT_FAILED'),
    )
    const client = recordingJobClient()
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createJob(ctx, {
      address_district: 'q7',
      client_request_id: 'c1000000-0000-4000-8000-000000000002',
      description: 'Pipe leak under the sink',
      photo_urls: [],
      problem_chips: ['pipe_leak'],
      service_type: 'plumbing',
    }, {})).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })

    expect(client.jobUpdates).toContainEqual(expect.objectContaining({
      status: 'cancelled',
      client_request_id: null,
    }))
    expect(mocks.createBroadcasts).not.toHaveBeenCalled()
  })

  it('retires the analyzing shell when the autonomy gate rejects the transition', async () => {
    mocks.runKaelAutonomyOrchestrator.mockResolvedValueOnce({
      gate: {
        result: 'reject',
        audit: {
          reason_code: 'STATE_TRANSITION_INVALID',
          safe_metadata: { transition_error: 'invalid transition' },
        },
      },
    })
    const client = recordingJobClient()
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createJob(ctx, {
      address_district: 'q7',
      client_request_id: 'c1000000-0000-4000-8000-000000000003',
      description: 'Pipe leak under the sink',
      photo_urls: [],
      problem_chips: ['pipe_leak'],
      service_type: 'plumbing',
    }, {})).rejects.toMatchObject({ code: 'INVALID_STATUS', status: 409 })

    expect(client.jobUpdates).toContainEqual(expect.objectContaining({
      status: 'cancelled',
      client_request_id: null,
    }))
    expect(mocks.createBroadcasts).not.toHaveBeenCalled()
  })

  it('retires the analyzing shell when estimate persistence fails', async () => {
    const client = recordingJobClient({ failJobUpdateAt: 1 })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createJob(ctx, {
      address_district: 'q7',
      client_request_id: 'c1000000-0000-4000-8000-000000000004',
      description: 'Pipe leak under the sink',
      photo_urls: [],
      problem_chips: ['pipe_leak'],
      service_type: 'plumbing',
    }, {})).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })

    expect(client.jobUpdates).toContainEqual(expect.objectContaining({
      status: 'cancelled',
      client_request_id: null,
    }))
    expect(mocks.createBroadcasts).not.toHaveBeenCalled()
  })

  it('replays an existing idempotent result even when the new-operation rate bucket is empty', async () => {
    mocks.checkRateLimit.mockReturnValueOnce({ allowed: false, retryAfterMs: 60_000 })
    const client = recordingJobClient({
      existingJob: {
        display_code: 'NS-2026-000777',
        final_price: 350_000,
        id: 'job-existing',
        kael_advisory: null,
        kael_complexity: 'medium',
        kael_estimate_card_v3: {
          estimate: {
            complexity: 'medium',
            confidence: 0.8,
            problem_category: 'pipe_leak',
            price_max: 350_000,
            price_min: 150_000,
          },
        },
        kael_price_max: 350_000,
        kael_price_min: 150_000,
        kael_problem_identified: 'Pipe leak under the sink',
        service_type: 'plumbing',
        status: 'broadcasting',
      },
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createJob(ctx, {
      address_district: 'q7',
      client_request_id: 'c1000000-0000-4000-8000-000000000005',
      description: 'Pipe leak under the sink',
      photo_urls: [],
      problem_chips: ['pipe_leak'],
      service_type: 'plumbing',
    }, {})).resolves.toMatchObject({
      display_code: 'NS-2026-000777',
      job_id: 'job-existing',
      status: 'broadcasting',
    })
    expect(client.calls.find((call) =>
      call.table === 'jobs' && call.operations.some(([operation]) => operation === 'single')
    )?.operations).toContainEqual([
      'select',
      expect.stringContaining('display_code'),
    ])
    expect(mocks.runKaelPipeline).not.toHaveBeenCalled()
    expect(mocks.checkRateLimit).not.toHaveBeenCalled()
  })
})

function recordingJobClient(options: {
  existingJob?: Record<string, unknown>
  failJobUpdateAt?: number
} = {}) {
  const jobUpdates: Array<Record<string, unknown>> = []
  const calls: Array<{ operations: unknown[][]; table: string }> = []
  let jobUpdateAttempt = 0

  const from = (table: string) => {
    const operations: unknown[][] = []
    const query = {
      select: (columns?: string) => {
        operations.push(['select', columns])
        return query
      },
      insert: (value: unknown) => {
        operations.push(['insert', value])
        return query
      },
      delete: () => query,
      update: (value: Record<string, unknown>) => {
        operations.push(['update', value])
        if (table === 'jobs') jobUpdates.push(value)
        return query
      },
      upsert: () => query,
      eq: (column: string, value: unknown) => {
        operations.push(['eq', column, value])
        return query
      },
      neq: () => query,
      gt: () => query,
      gte: () => query,
      lte: () => query,
      is: () => query,
      in: () => query,
      contains: () => query,
      or: () => query,
      order: () => query,
      range: () => query,
      limit: () => query,
      single: () => {
        operations.push(['single'])
        return query
      },
      maybeSingle: () => {
        operations.push(['maybeSingle'])
        return query
      },
      then<TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        calls.push({ operations, table })
        const insert = operations.find(([operation]) => operation === 'insert')
        const update = operations.find(([operation]) => operation === 'update')
        const select = operations.find(([operation]) => operation === 'select')
        if (table === 'jobs' && update) jobUpdateAttempt += 1
        const result = table === 'jobs' && update && options.failJobUpdateAt === jobUpdateAttempt
          ? { data: null, error: { code: 'ESTIMATE_WRITE_FAILED' } }
          : table === 'jobs' && select?.[1] === 'id' && options.existingJob
          ? { data: { id: options.existingJob.id }, error: null }
          : table === 'jobs' && select && options.existingJob
          ? { data: options.existingJob, error: null }
          : table === 'jobs' && (insert || update)
          ? { data: { display_code: 'NS-2026-000001', id: 'job-1' }, error: null }
          : { data: null, error: null }
        return Promise.resolve(result).then(onfulfilled, onrejected)
      },
    }
    return query
  }

  return { calls, from, jobUpdates, rpc: vi.fn() }
}
