import { describe, expect, it } from 'vitest'

import {
  customerKaelFeedbackSchema,
  workerKaelFeedbackSchema,
} from '@nestscout/shared'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/platform/auth'
import {
  submitCustomerKaelFeedback,
  submitWorkerKaelFeedback,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/feedback'

describe('structured Kael feedback', () => {
  it('requires either a legacy message or a response id with rating', () => {
    expect(customerKaelFeedbackSchema.safeParse({ source: 'customer_chat' }).success).toBe(false)
    expect(workerKaelFeedbackSchema.safeParse({ reason: 'unclear', source: 'worker_chat' }).success).toBe(false)
    expect(customerKaelFeedbackSchema.safeParse({
      response_id: 'response-1', rating: 'useful', source: 'customer_chat', language: 'vi',
    }).success).toBe(true)
    expect(customerKaelFeedbackSchema.safeParse({
      message: 'Kael should explain this estimate more clearly.',
      response_id: 'response-1',
      source: 'customer_chat',
      language: 'en',
    }).success).toBe(false)
    expect(workerKaelFeedbackSchema.safeParse({
      message: 'Kael should explain this estimate more clearly.',
      rating: 'useful',
      source: 'profile',
      language: 'en',
    }).success).toBe(false)
    expect(workerKaelFeedbackSchema.safeParse({
      message: 'Kael should explain this estimate more clearly.', source: 'profile', language: 'en',
    }).success).toBe(true)
  })

  it('upserts customer feedback by actor and response id with a scrubbed reason', async () => {
    const client = makeSequenceClient([{ data: {
      id: 'feedback-1', created_at: '2026-08-07T00:00:00.000Z',
    }, error: null }])

    const result = await submitCustomerKaelFeedback(context('customer', client), {
      response_id: 'response-1',
      rating: 'not_useful',
      reason: 'Call 0901234567 for details',
      source: 'customer_chat',
      language: 'vi',
    })

    expect(result).toMatchObject({ feedback_id: 'feedback-1', status: 'new' })
    expect(client.calls[0]).toMatchObject({ table: 'customer_kael_feedback' })
    expect(client.calls[0].operations).toContainEqual([
      'upsert',
      expect.objectContaining({
        customer_id: 'customer-1',
        response_id: 'response-1',
        rating: 'not_useful',
        reason_scrubbed: expect.stringContaining('[phone]'),
        source: 'customer_chat',
      }),
      { onConflict: 'customer_id,response_id' },
    ])
  })

  it('upserts worker feedback by actor and response id', async () => {
    const client = makeSequenceClient([{ data: {
      id: 'feedback-2', created_at: '2026-08-07T00:00:00.000Z',
    }, error: null }])

    await submitWorkerKaelFeedback(context('worker', client), {
      response_id: 'response-2',
      rating: 'useful',
      source: 'worker_chat',
      language: 'en',
    })

    expect(client.calls[0].operations).toContainEqual([
      'upsert',
      expect.objectContaining({
        worker_id: 'worker-1',
        response_id: 'response-2',
        rating: 'useful',
      }),
      { onConflict: 'worker_id,response_id' },
    ])
  })
})

type QueryResult = { data: unknown; error: { code?: string; message?: string } | null }
type QueryCall = { table: string; operations: Array<[string, ...unknown[]]> }

function context(role: 'customer' | 'worker', client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return {
    success: true,
    user: { id: role === 'customer' ? 'customer-1' : 'worker-1' },
    role,
    supabase: client,
  }
}

function makeSequenceClient(results: QueryResult[]) {
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
    insert(value: unknown) { call.operations.push(['insert', value]); return query },
    upsert(value: unknown, options?: unknown) { call.operations.push(['upsert', value, options]); return query },
    select(columns?: string) { call.operations.push(['select', columns]); return query },
    single() { call.operations.push(['single']); return query },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(results.shift() ?? { data: null, error: null }).then(onfulfilled, onrejected)
    },
  }
  return query
}
