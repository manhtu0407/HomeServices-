import { describe, expect, it } from 'vitest'
import { createJob } from '../../../../../supabase/functions/mobile-api/_shared/services/jobs/create'
import { createKaelChat } from '../../../../../supabase/functions/mobile-api/_shared/services/kael-chat/index'
import { confirmKaelChat } from '../../../../../supabase/functions/mobile-api/_shared/services/kael-chat/confirm'
import { buildInitialDiagnosisScopeArtifact } from '../../../../../supabase/functions/mobile-api/_shared/kael'
import {
  validateFutureHcmcSchedule,
  type HcmcScheduleWindow,
} from '../../../../../supabase/functions/mobile-api/_shared/services/jobs/schedule-policy'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'

const now = new Date('2026-07-14T18:30:00.000Z')

describe('mobile-api HCMC scheduling boundary', () => {
  it.each([
    ['past', '2026-07-14T18:29:59.999Z'],
    ['equal', '2026-07-14T18:30:00.000Z'],
  ])('rejects a %s scheduled instant', (_case, scheduledAt) => {
    expect(validateFutureHcmcSchedule(scheduledAt, undefined, now)).toBe('past')
  })

  it('accepts a future instant that exactly matches its HCMC window', () => {
    const window: HcmcScheduleWindow = {
      date: '2026-07-15',
      start: '08:00',
      end: '10:00',
      time_zone: 'Asia/Ho_Chi_Minh',
    }

    expect(validateFutureHcmcSchedule('2026-07-15T01:00:00.000Z', window, now)).toBeNull()
  })

  it.each([
    ['2026-07-15T00:00:00.000Z', 'window_mismatch'],
    ['not-a-date', 'invalid'],
  ])('rejects %s against the HCMC schedule contract', (scheduledAt, expected) => {
    expect(validateFutureHcmcSchedule(scheduledAt, {
      date: '2026-07-15',
      start: '08:00',
      end: '10:00',
      time_zone: 'Asia/Ho_Chi_Minh',
    }, now)).toBe(expected)
  })

  it('rejects a non-HCMC schedule window at the runtime boundary', () => {
    const wrongZone = {
      date: '2026-07-15',
      start: '08:00',
      end: '10:00',
      time_zone: 'UTC',
    } as unknown as HcmcScheduleWindow

    expect(validateFutureHcmcSchedule(
      '2026-07-15T01:00:00.000Z',
      wrongZone,
      now,
    )).toBe('window_mismatch')
  })

  it('rejects a schedule window whose end is not after its start', () => {
    expect(validateFutureHcmcSchedule('2026-07-15T03:00:00.000Z', {
      date: '2026-07-15',
      start: '10:00',
      end: '08:00',
      time_zone: 'Asia/Ho_Chi_Minh',
    }, now)).toBe('window_mismatch')
  })

  it('rejects a past job before touching the database', async () => {
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'schedule-customer' },
      role: 'customer',
      supabase: new Proxy({}, {
        get() {
          throw new Error('database boundary should not run')
        },
      }),
    }

    await expect(createJob(ctx, {
      service_type: 'electrical',
      description: 'Ổ cắm mất điện cần kiểm tra',
      problem_chips: ['outlet_not_working'],
      photo_urls: [],
      address_district: 'Quận 7',
      scheduled_at: '2020-01-01T00:00:00.000Z',
    }, {})).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })
  })

  it('rejects a stale booking intake before creating a Kael session', async () => {
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'schedule-chat-customer' },
      role: 'customer',
      supabase: new Proxy({}, {
        get() {
          throw new Error('database boundary should not run')
        },
      }),
    }

    await expect(createKaelChat(ctx, {
      service_type: 'electrical',
      profile_id: 'electric_diagnose',
      message: 'Ổ cắm mất điện cần kiểm tra',
      problem_chips: ['outlet_not_working'],
      photo_urls: [],
      scheduled_at: '2020-01-01T01:00:00.000Z',
      schedule_window: {
        date: '2020-01-01',
        start: '08:00',
        end: '10:00',
        time_zone: 'Asia/Ho_Chi_Minh',
      },
    }, {})).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })
  })

  it('keeps an already-created job retry idempotent after its schedule passes', async () => {
    const inserts: unknown[] = []
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'schedule-retry-customer' },
      role: 'customer',
      supabase: queuedDb([
        { data: { id: 'existing-scheduled-job' }, error: null },
        {
          data: {
            id: 'existing-scheduled-job',
            status: 'broadcasting',
            service_type: 'electrical',
            kael_problem_identified: 'Ổ cắm mất điện',
            kael_complexity: 'medium',
            kael_price_min: 150_000,
            kael_price_max: 250_000,
            kael_advisory: null,
            kael_estimate_card_v3: {
              estimate: {
                confidence: 0.9,
                problem_category: 'outlet_not_working',
              },
            },
            final_price: null,
          },
          error: null,
        },
      ], inserts),
    }

    const response = await createJob(ctx, {
      service_type: 'electrical',
      description: 'Ổ cắm mất điện cần kiểm tra',
      problem_chips: ['outlet_not_working'],
      photo_urls: [],
      address_district: 'Quận 7',
      scheduled_at: '2020-01-01T00:00:00.000Z',
      client_request_id: 'schedule-retry-1',
    }, {})

    expect(response.job_id).toBe('existing-scheduled-job')
    expect(inserts).toEqual([])
  })

  it('rejects a session whose desired time passes before confirmation', async () => {
    const rpcCalls: string[] = []
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'schedule-confirm-customer' },
      role: 'customer',
      supabase: queuedDb([{
        data: {
          id: 'schedule-session',
          job_id: null,
          customer_id: 'schedule-confirm-customer',
          case_phase: 'analysis',
          diagnosis_scope: buildInitialDiagnosisScopeArtifact({
            serviceType: 'electrical',
            customerGoal: 'Ổ cắm mất điện cần kiểm tra',
          }),
          scheduled_at: '2020-01-01T00:00:00.000Z',
        },
        error: null,
      }], [], rpcCalls),
    }

    await expect(confirmKaelChat(ctx, 'schedule-session', {})).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 400,
    })
    expect(rpcCalls).toEqual([])
  })
})

type QueuedResult = { data: unknown; error: null }

function queuedDb(results: QueuedResult[], inserts: unknown[], rpcCalls: string[] = []) {
  const query = {
    select: () => query,
    insert: (value: unknown) => {
      inserts.push(value)
      return query
    },
    delete: () => query,
    update: () => query,
    upsert: () => query,
    eq: () => query,
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
    single: () => query,
    maybeSingle: () => query,
    then<TResult1 = QueuedResult, TResult2 = never>(
      onfulfilled?: ((value: QueuedResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      const next = results.shift() ?? { data: null, error: null }
      return Promise.resolve(next).then(onfulfilled, onrejected)
    },
  }

  return {
    from: () => query,
    rpc: (name: string) => {
      rpcCalls.push(name)
      return Promise.resolve({ data: null, error: null })
    },
  }
}
