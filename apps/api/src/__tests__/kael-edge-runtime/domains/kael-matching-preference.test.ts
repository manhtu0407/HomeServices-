import { describe, expect, it } from 'vitest'

import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import type { DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db.ts'
import {
  beginMatchingPreferencePrompt,
  hasSavedWorker,
  isCustomerFavoriteWorker,
  reconcileSavedWorkerFallback,
  setJobMatchingPreference,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/matching-preference.ts'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('matching preference coordinator', () => {
  installEdgeRuntimeTestHooks()

  it('opens a saved-worker choice without broadcasting before the customer decides', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'awaiting_customer_confirm',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          address_district: 'q7',
          kael_problem_identified: 'Ống nước rò rỉ',
          kael_price_max: 250000,
          final_price: null,
        },
        error: null,
      },
      { data: { id: 'job-1' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ], {
      begin_job_matching_preference_atomic: [
        { data: [{ ok: true, error_code: null }], error: null },
      ],
    }, {
      job_matching_preferences: [
        {
          data: { strategy: 'pending', auto_general: true, fallback_at: null },
          error: null,
        },
      ],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(beginMatchingPreferencePrompt(ctx, 'job-1')).resolves.toMatchObject({
      stage: 'awaiting_choice',
      strategy: 'pending_choice',
    })

    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
    expect(client.calls.some((call) =>
      call.table === 'job_broadcasts' &&
      call.operations.some((operation) => operation[0] === 'insert' || operation[0] === 'update')
    )).toBe(false)
  })

  it('treats a stale rebook target as not saved before matching begins', async () => {
    const client = makeSequenceClient([], {}, {
      customer_favorite_workers: [{ data: null, error: null }],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(isCustomerFavoriteWorker(ctx, 'worker-1')).resolves.toBe(false)
    expect(client.calls).toHaveLength(1)
  })

  it('checks only customer-owned saved records before opening the choice gate', async () => {
    const client = makeSequenceClient([], {}, {
      customer_favorite_workers: [{ data: [{ worker_id: 'worker-1' }], error: null }],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(hasSavedWorker(ctx)).resolves.toBe(true)
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
    expect(client.calls[0]?.operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
  })

  it('rejects a worker target that the ownership RPC did not authorize', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          address_district: 'q7',
        },
        error: null,
      },
    ], {
      set_job_matching_preference_atomic: [
        {
          data: [{
            ok: false,
            error_code: 'FAVORITE_NOT_FOUND',
            strategy: null,
            preferred_worker_id: null,
            auto_general: null,
          }],
          error: null,
        },
      ],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(setJobMatchingPreference(ctx, 'job-1', {
      auto_general: true,
      client_request_id: '86d2f650-2e7b-4534-99f3-1a0f0cda2c41',
      mode: 'saved_worker_first',
      worker_id: '4a143d3b-5d3b-4e03-a7aa-572c32a380dd',
    })).rejects.toMatchObject({
      code: 'WORKER_NOT_ELIGIBLE',
      status: 409,
    })

    expect(client.calls.some((call) =>
      call.table === 'rpc:claim_job_broadcast_retry_atomic'
    )).toBe(false)
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
  })

  it('does not turn a legacy general search into a saved-worker preference', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'broadcasting',
          customer_id: 'customer-1',
          service_type: 'plumbing',
          address_district: 'q7',
        },
        error: null,
      },
    ], {
      set_job_matching_preference_atomic: [
        {
          data: [{
            ok: false,
            error_code: 'PREFERENCE_REQUIRED',
            strategy: null,
            preferred_worker_id: null,
            auto_general: null,
          }],
          error: null,
        },
      ],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(setJobMatchingPreference(ctx, 'job-1', {
      auto_general: true,
      client_request_id: '86d2f650-2e7b-4534-99f3-1a0f0cda2c42',
      mode: 'saved_worker_first',
      worker_id: '4a143d3b-5d3b-4e03-a7aa-572c32a380dd',
    })).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })

    expect(client.calls.some((call) =>
      call.table === 'rpc:claim_job_broadcast_retry_atomic'
    )).toBe(false)
  })

  it('returns a recoverable receipt instead of claiming a saved-worker request was sent after an eligibility read fails', async () => {
    const client = makeSequenceClient([], {
      set_job_matching_preference_atomic: [
        { data: [{ ok: true, error_code: null }], error: null },
      ],
    }, {
      customer_favorite_workers: [{ data: [], error: null }],
      job_broadcasts: [
        { data: [], error: null },
        { data: [], error: null },
      ],
      job_events: [
        { data: null, error: null },
        {
          data: [{
            event_type: 'matching_recovery_required',
            created_at: '2026-08-11T10:01:02.000Z',
            safe_metadata: {},
          }],
          error: null,
        },
      ],
      job_matching_preferences: [{
        data: { strategy: 'saved_worker_first', auto_general: true, fallback_at: null },
        error: null,
      }],
      jobs: [
        {
          data: {
            id: 'job-1',
            status: 'broadcasting',
            customer_id: 'customer-1',
            service_type: 'plumbing',
            address_district: 'q7',
          },
          error: null,
        },
        {
          data: {
            customer_id: 'customer-1',
            address_lat: null,
            address_lng: null,
            problem_chips: [],
            service_problem_id: null,
            kael_problem_identified: null,
            diagnosis_scope: null,
          },
          error: null,
        },
      ],
      worker_profiles: [{ data: null, error: { code: 'PGRST500' } }],
    })
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(setJobMatchingPreference(ctx, 'job-1', {
      auto_general: true,
      client_request_id: '86d2f650-2e7b-4534-99f3-1a0f0cda2c43',
      mode: 'saved_worker_first',
      worker_id: '4a143d3b-5d3b-4e03-a7aa-572c32a380dd',
    })).resolves.toMatchObject({
      broadcast_sent: false,
      matching_state: { batch: null, stage: 'recovery_required' },
    })

    expect(client.calls.some((call) => call.table === 'job_events' &&
      call.operations.some((operation) => operation[0] === 'insert' &&
        (operation[1] as { event_type?: unknown }).event_type === 'matching_recovery_required')),
    ).toBe(true)
  })

  it('does not create a fallback batch when another coordinator holds the retry lease', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          customer_id: 'customer-1',
          status: 'broadcasting',
          service_type: 'plumbing',
          address_district: 'q7',
        },
        error: null,
      },
    ], {
      claim_saved_worker_fallback_atomic: [
        {
          data: [{
            claimed: true,
            error_code: null,
            customer_id: 'customer-1',
            preferred_worker_id: 'worker-1',
          }],
          error: null,
        },
      ],
      claim_job_broadcast_retry_atomic: [
        { data: [{ claimed: false, error_code: 'CLAIM_ACTIVE' }], error: null },
      ],
    })

    await expect(reconcileSavedWorkerFallback(client as unknown as DbClient, {
      allowWithoutSavedBroadcast: true,
      expectedWorkerId: 'worker-1',
      jobId: 'job-1',
      reason: 'saved_worker_expired',
    })).resolves.toEqual({ started: false, reasonCode: 'CLAIM_ACTIVE' })

    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(false)
    expect(client.calls.some((call) => call.table === 'job_broadcasts')).toBe(false)
  })

  it('reuses the selection lease when an unavailable saved worker expands the search', async () => {
    const client = makeSequenceClient([], {
      claim_saved_worker_fallback_atomic: [
        {
          data: [{
            claimed: true,
            error_code: null,
            customer_id: 'customer-1',
            preferred_worker_id: 'worker-1',
          }],
          error: null,
        },
      ],
      insert_notification_atomic: [{ data: [], error: null }],
    }, {
      jobs: [
        {
          data: {
            id: 'job-1',
            customer_id: 'customer-1',
            status: 'broadcasting',
            service_type: 'plumbing',
            address_district: 'q7',
          },
          error: null,
        },
        { data: null, error: null },
      ],
      customer_favorite_workers: [{ data: [], error: null }],
      job_broadcasts: [{ data: [], error: null }],
      job_events: [
        { data: null, error: null },
        { data: null, error: null },
      ],
      worker_profiles: [{ data: [], error: null }],
    })

    await expect(reconcileSavedWorkerFallback(client as unknown as DbClient, {
      allowWithoutSavedBroadcast: true,
      expectedWorkerId: 'worker-1',
      jobId: 'job-1',
      leaseAlreadyHeld: true,
      reason: 'saved_worker_unavailable',
    })).resolves.toEqual({
      started: true,
      broadcast_sent: false,
      reasonCode: 'NO_WORKER',
    })

    expect(client.calls.some((call) =>
      call.table === 'rpc:claim_job_broadcast_retry_atomic'
    )).toBe(false)
    expect(client.calls.some((call) => call.table === 'worker_profiles')).toBe(true)
  })
})
