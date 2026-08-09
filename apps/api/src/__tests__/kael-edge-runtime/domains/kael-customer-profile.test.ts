import { describe, expect, it } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('customer-profile', () => {
  installEdgeRuntimeTestHooks()

  it('stores customer Kael feedback with a scrubbed learning copy', async () => {
    const client = makeSequenceClient([
      {
        data: {
          id: 'feedback-1',
          status: 'new',
          created_at: '2026-06-02T00:00:00.000Z',
        },
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).submitCustomerKaelFeedback(ctx, {
      language: 'vi',
      message: 'Kael nên nhắc rõ hơn qua số 0901234567 khi biên giá thay đổi.',
      source: 'profile',
    })

    expect(result).toEqual({
      feedback_id: 'feedback-1',
      status: 'new',
      created_at: '2026-06-02T00:00:00.000Z',
    })
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].table).toBe('customer_kael_feedback')
    expect(client.calls[0].operations).toContainEqual([
      'insert',
      expect.objectContaining({
        customer_id: 'customer-1',
        language: 'vi',
        message: 'Kael nên nhắc rõ hơn qua số 0901234567 khi biên giá thay đổi.',
        message_scrubbed: expect.stringContaining('[phone]'),
        source: 'profile',
        status: 'new',
      }),
    ])
    expect(client.calls[0].operations).toContainEqual(['select', 'id,created_at'])
    expect(client.calls[0].operations).toContainEqual(['single'])
  })

  it('U-5: updateMyKaelMemory PII-scrubs the customer preference note before storing', async () => {
    const client = makeSequenceClient([
      { data: null, error: null }, // upsert
      { data: null, error: null }, // audit write
      { data: { customer_id: 'customer-1', language: 'vi', preference_summary: '' }, error: null }, // getMyKaelMemory select
      { data: null, error: null }, // audit read
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    await createEdgeServices({}).updateMyKaelMemory(ctx, {
      preference_summary: 'Gọi tôi qua 0901234567 khi đổi giá nhé.',
    })

    expect(client.calls[0].table).toBe('customer_kael_memory')
    expect(client.calls[0].operations).toContainEqual([
      'upsert',
      expect.objectContaining({
        customer_id: 'customer-1',
        preference_summary: expect.stringContaining('[phone]'),
      }),
    ])
  })

  it('U-5: listMyPendingDecisions is scoped to the customer and only waiting scope-changes', async () => {
    const client = makeSequenceClient([
      {
        data: [{ id: 'job-1', service_type: 'electrical', kael_problem_identified: 'outlet' }],
        error: null,
      },
      {
        data: [{
          id: 'sc-1',
          job_id: 'job-1',
          requested_description: 'extra outlet',
          reason: 'found corrosion',
          price_min: 200000,
          price_max: 300000,
          created_at: '2026-06-13T00:00:00.000Z',
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

    const result = await createEdgeServices({}).listMyPendingDecisions(ctx)

    expect(client.calls[0].table).toBe('jobs')
    expect(client.calls[0].operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(client.calls[0].operations).toContainEqual(['eq', 'status', 'scope_change_pending'])
    expect(client.calls[1].table).toBe('scope_change_requests')
    expect(client.calls[1].operations).toContainEqual(['eq', 'status', 'waiting_customer_decision'])
    expect(client.calls[1].operations).toContainEqual(['in', 'job_id', ['job-1']])
    expect(result.pending_decisions).toHaveLength(1)
    expect(result.pending_decisions[0]).toMatchObject({
      kind: 'scope_change',
      scope_change_id: 'sc-1',
      job_id: 'job-1',
      price_max: 300000,
    })
  })

  it('U-5: listMyThreads scopes to the customer and folds latest message + unread count', async () => {
    const client = makeSequenceClient([
      {
        data: [{ id: 'job-1', status: 'repairing', service_type: 'plumbing' }],
        error: null,
      },
      {
        data: [
          { job_id: 'job-1', content: 'latest from worker', sender_role: 'worker', is_read: false, created_at: '2026-06-13T03:00:00.000Z' },
          { job_id: 'job-1', content: 'older mine', sender_role: 'customer', is_read: true, created_at: '2026-06-13T02:00:00.000Z' },
        ],
        error: null,
      },
    ])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: client,
    }

    const result = await createEdgeServices({}).listMyThreads(ctx)

    expect(client.calls[0].table).toBe('jobs')
    expect(client.calls[0].operations).toContainEqual(['eq', 'customer_id', 'customer-1'])
    expect(client.calls[1].table).toBe('chat_messages')
    expect(result.threads).toHaveLength(1)
    expect(result.threads[0]).toMatchObject({
      job_id: 'job-1',
      unread_count: 1,
      last_message: { content: 'latest from worker', sender_role: 'worker' },
    })
  })
})
