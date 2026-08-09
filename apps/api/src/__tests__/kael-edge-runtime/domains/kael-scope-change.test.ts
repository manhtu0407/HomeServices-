import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient, attachDefaultJobMediaStorage } from '../harness'

describe('scope-change', () => {
  installEdgeRuntimeTestHooks()

  it('persists Kael review before asking the customer to decide a scope change', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const target = typeof url === 'string' ? url : url.toString()
      if (target.includes('api.anthropic.com')) {
        return new Response(JSON.stringify({
          content: [{
            type: 'text',
            text: JSON.stringify({
              complexity_assessment: 'medium',
              price_min: 200000,
              price_max: 350000,
              confidence: 0.42,
              problem_summary: 'Phần phát sinh: ống chính cần thay đoạn lớn.',
              advisory: 'Cần Kael quyết định trước khi thợ tiếp tục.',
            }),
          }],
          usage: { input_tokens: 120, output_tokens: 48 },
        }))
      }
      return new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      {
        data: {
          id: 'job-1',
          status: 'repairing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          service_type: 'electrical',
          description: 'Ổ cắm bị cháy',
          kael_problem_identified: 'Ổ cắm có dấu hiệu cháy',
          kael_complexity: 'small',
          kael_price_min: 150000,
          kael_price_max: 250000,
        },
        error: null,
      },
      {
        data: [{
          ok: true,
          reason: null,
          validated_refs: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
        }],
        error: null,
      },
      {
        data: [{ ok: true, error_code: null, claimed: true, replayed: false }],
        error: null,
      },
      { data: { scope_change_rate: 0.4 }, error: null },
      {
        data: [{
          ok: true,
          error_code: null,
          scope_change_id: 'scope-1',
          scope_status: 'waiting_customer_decision',
          created_at_ts: '2026-05-20T00:00:00.000Z',
          side_effects_state: {
            database: { effect_id: '11111111-1111-4111-8111-111111111111', state: 'pending' },
            learning: { effect_id: '22222222-2222-4222-8222-222222222222', state: 'pending' },
            push: { effect_id: '33333333-3333-4333-8333-333333333333', state: 'pending' },
          },
        }],
        error: null,
      },
      { data: [{ ok: true, completed: true }], error: null },
      { data: [{ ok: true, completed: true }], error: null },
      {
        data: [{
          ok: true,
          claimed: true,
          completed: false,
          effect_id: '33333333-3333-4333-8333-333333333333',
          customer_id: 'customer-1',
        }],
        error: null,
      },
      { data: [{ id: 'token-1', user_id: 'customer-1', push_token: 'ExponentPushToken[customer]' }], error: null },
      { data: [{ completed: true }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({ anthropicApiKey: 'test-anthropic-key' }).requestScopeChange(ctx, 'job-1', {
      client_request_id: 'c5100000-0000-4000-8000-000000000001',
      new_description: 'Add repair scope after onsite inspection',
      reason: 'Found additional damaged part that needs immediate handling',
      photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
    })).resolves.toMatchObject({
      scope_change_id: 'scope-1',
      job_id: 'job-1',
      status: 'waiting_customer_decision',
    })

    const requestCallIndex = client.calls.findIndex((call) => call.table === 'rpc:request_scope_change_atomic')
    const databaseEffectCallIndex = client.calls.findIndex((call) =>
      call.table === 'rpc:apply_scope_change_database_effect_atomic'
    )
    expect(requestCallIndex).toBeGreaterThan(-1)
    expect(databaseEffectCallIndex).toBeGreaterThan(requestCallIndex)
    const requestCall = client.calls[requestCallIndex]
    expect(requestCall.operations).toContainEqual([
      'rpc',
      'request_scope_change_atomic',
      expect.objectContaining({
        p_evidence_photo_urls: ['supabase://job-media/job-1/scope_change_evidence/a.jpg'],
        p_kael_computed_min: 200000,
        p_kael_computed_max: 350000,
        p_kael_review: expect.objectContaining({
          version: 'scope-change-estimate.2026-05-23.v1',
          fallback_used: false,
          problem_summary: expect.any(String),
          advisory: expect.any(String),
          complexity_assessment: 'medium',
          confidence: 0.42,
        }),
        p_database_effect_id: expect.any(String),
        p_database_effect_payload: expect.objectContaining({
          api_logs: expect.arrayContaining([
            expect.objectContaining({
              purpose: 'scope_change',
              provider: 'anthropic',
              model: 'claude-sonnet-5',
              success: true,
            }),
            expect.objectContaining({
              purpose: 'scope_change',
              provider: 'anthropic',
              model: 'claude-opus-4-8',
              success: true,
              safe_metadata: { escalation_reason: 'low_confidence' },
            }),
          ]),
          optimization_metrics: expect.any(Array),
        }),
        p_learning_effect_id: expect.any(String),
        p_push_effect_id: expect.any(String),
      }),
    ])
    const progressCalls = client.calls.filter((call) =>
      call.operations.some((op) => {
        const value = op[1] as { kael_progress?: unknown } | undefined
        return op[0] === 'update' && value?.kael_progress !== undefined
      })
    )
    expect(progressCalls.map((call) => call.table)).toEqual(['jobs', 'jobs'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(client.calls.some((call) => call.table === 'api_logs')).toBe(false)
    const databaseEffectCall = client.calls[databaseEffectCallIndex]
    expect(databaseEffectCall?.operations).toContainEqual([
      'rpc',
      'apply_scope_change_database_effect_atomic',
      expect.objectContaining({
        p_job_id: 'job-1',
        p_worker_id: 'worker-1',
        p_client_request_id: 'c5100000-0000-4000-8000-000000000001',
        p_scope_change_id: 'scope-1',
        p_effect_id: '11111111-1111-4111-8111-111111111111',
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringMatching(
          /scope_effect_id.*33333333-3333-4333-8333-333333333333/,
        ),
      }),
    )
  })

  it('keeps scope-change evidence media separate from completion photos', async () => {
    const jobId = '11111111-1111-1111-1111-111111111111'
    const client = makeSequenceClient([
      {
        data: {
          id: jobId,
          status: 'repairing',
          service_type: 'plumbing',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          photo_urls: [],
          completion_photo_urls: ['supabase://job-media/existing-after.jpg'],
        },
        error: null,
      },
      { data: [], error: null },
      { data: [{ id: 'media-1' }], error: null },
      { data: null, error: null },
    ])
    attachDefaultJobMediaStorage(client)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({}).attachJobMedia(ctx, jobId, {
      assets: [{
        object_path: `${jobId}/scope_change_evidence/evidence.jpg`,
        stage: 'scope_change_evidence',
        mime_type: 'image/jpeg',
        file_size_bytes: 1234,
      }],
    })).resolves.toMatchObject({
      job_id: jobId,
      media: [expect.objectContaining({
        stage: 'scope_change_evidence',
        storage_ref: `supabase://job-media/${jobId}/scope_change_evidence/evidence.jpg`,
      })],
    })

    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) =>
        op[0] === 'update' && JSON.stringify(op[1]).includes('completion_photo_urls')
      )
    )).toBe(false)
  })

  it('notifies the worker when a scope change decision is recorded', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      { data: { job_id: 'job-1' }, error: null },
      {
        data: [{
          ok: true,
          error_code: null,
          job_id_out: 'job-1',
          scope_status: 'approved_by_customer',
          decided_at_ts: '2026-05-20T00:00:00.000Z',
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
      { data: { worker_id: 'worker-1' }, error: null },
      { data: [{ notification_id: 'notification-1', created_at_ts: '2026-05-20T00:00:00.000Z' }], error: null },
      { data: [{ id: 'token-1', user_id: 'worker-1', push_token: 'ExponentPushToken[worker]' }], error: null },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).resolves.toMatchObject({
      scope_change_id: 'scope-1',
      job_id: 'job-1',
      status: 'approved_by_customer',
    })

    const notificationCall = client.calls.find((call) => call.table === 'rpc:insert_notification_atomic')
    expect(notificationCall?.operations).toContainEqual([
      'rpc',
      'insert_notification_atomic',
      expect.objectContaining({
        p_user_id: 'worker-1',
        p_job_id: 'job-1',
        p_event_type: 'scope_change_approved',
        p_safe_metadata: expect.objectContaining({ scope_change_id: 'scope-1', decision: 'approve', actor: 'customer' }),
      }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('/(worker)/jobs?job_id=job-1'),
      }),
    )
    expect(client.calls.find((call) => call.table === 'scope_change_requests')?.operations)
      .toContainEqual(['select', 'job_id, request_timing, resume_job_status'])
    expect(client.calls.some((call) =>
      call.table === 'jobs' &&
      call.operations.some((op) => op[0] === 'update' && JSON.stringify(op[1]).includes('final_price'))
    )).toBe(false)
  })

  it('fails A11 Kael scope decision atomically when the Kael computed max is missing', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ status: 'ok', id: 'ticket-1' }] }))
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = makeSequenceClient([
      { data: { job_id: 'job-1' }, error: null },
      {
        data: [{
          ok: false,
          error_code: 'KAEL_PRICE_MISSING',
          job_id_out: null,
          scope_status: null,
          decided_at_ts: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).rejects.toMatchObject({
      code: 'KAEL_PRICE_MISSING',
      status: 409,
    })

    expect(client.calls).toHaveLength(2)
    expect(client.calls[0].table).toBe('scope_change_requests')
    expect(client.calls[1].table).toBe('rpc:decide_scope_change_atomic')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps scope-change decision races to STATUS_CHANGED instead of DB_ERROR', async () => {
    const client = makeSequenceClient([
      { data: { job_id: 'job-1' }, error: null },
      {
        data: [{
          ok: false,
          error_code: 'STATUS_CHANGED',
          job_id_out: null,
          scope_status: null,
          decided_at_ts: null,
        }],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await expect(createEdgeServices({}).decideScopeChange(ctx, 'scope-1', {
      decision: 'approve',
    })).rejects.toMatchObject({
      code: 'STATUS_CHANGED',
      status: 409,
    })
  })
})
