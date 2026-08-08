import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/platform/auth'
import {
  listKaelAdminQueue,
  parseKaelAdminQueueListInput,
  parseKaelAdminQueueResolveInput,
  resolveKaelAdminQueue,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/queue'
import {
  listKaelEstimateAccuracy,
  parseKaelEstimateAccuracyInput,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/estimate-accuracy'
import { getKaelModelHealth } from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/model-health'
import { matchAdminRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/admin'

const adminId = '99999999-9999-4999-8999-999999999999'
const queueId = '123e4567-e89b-42d3-a456-426614174000'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Kael admin operations', () => {
  it('matches queue, estimate-accuracy, and model-health routes as admin-only', () => {
    const decode = (value: string) => decodeURIComponent(value)
    expect(matchAdminRoute('/admin/kael-queue', 'GET', decode)).toMatchObject({
      kind: 'admin.kaelQueue.list', roles: ['admin'],
    })
    expect(matchAdminRoute(`/admin/kael-queue/${queueId}/resolve`, 'POST', decode)).toMatchObject({
      kind: 'admin.kaelQueue.resolve', queueId, roles: ['admin'],
    })
    expect(matchAdminRoute('/admin/kael-estimate-accuracy', 'GET', decode)).toMatchObject({
      kind: 'admin.kaelEstimateAccuracy.list', roles: ['admin'],
    })
    expect(matchAdminRoute('/admin/kael-model-health', 'GET', decode)).toMatchObject({
      kind: 'admin.kaelModelHealth.get', roles: ['admin'],
    })
  })

  it('parses bounded queue filters and rejects malformed input', () => {
    expect(parseKaelAdminQueueListInput(new URL(
      'https://example.test/admin/kael-queue?status=open&escalation_level=hard&page=2&limit=20',
    ))).toEqual({
      status: 'open', escalationLevel: 'hard', from: undefined, to: undefined, page: 2, limit: 20,
    })
    expect(() => parseKaelAdminQueueListInput(new URL(
      'https://example.test/admin/kael-queue?status=unknown',
    ))).toThrow()
    expect(() => parseKaelAdminQueueListInput(new URL(
      'https://example.test/admin/kael-queue?status=open&status=resolved',
    ))).toThrow()
    expect(() => parseKaelAdminQueueListInput(new URL(
      'https://example.test/admin/kael-queue?next=https://attacker.test',
    ))).toThrow()
    expect(() => parseKaelAdminQueueResolveInput({ note: 'x' })).toThrow()
    expect(parseKaelAdminQueueResolveInput({ note: 'Reviewed without PII.' })).toEqual({
      note: 'Reviewed without PII.',
    })
    expect(parseKaelAdminQueueResolveInput({ note: 'Liên hệ 0901234567 để xác nhận.' })).toEqual({
      note: 'Liên hệ [phone] để xác nhận.',
    })
  })

  it('lists one extra row for pagination, strips unsafe metadata, and never returns actor_id', async () => {
    const client = makeSequenceClient([{ data: [queueRow(queueId), queueRow('223e4567-e89b-42d3-a456-426614174000')], error: null }])
    const result = await listKaelAdminQueue(context('admin', client), {
      status: 'open', escalationLevel: 'hard', page: 1, limit: 1,
    })

    expect(result).toMatchObject({ page: 1, limit: 1, next_page: 2 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).not.toHaveProperty('actor_id')
    expect(result.items[0].safe_metadata).toEqual({ purpose: 'price_synthesis' })
    expect(result.items[0].response_summary).toBe('Call [phone] for review.')
    expect(client.calls[0].operations).toContainEqual(['range', 0, 1])
  })

  it('resolves only open or acknowledged rows and binds the resolver to the authenticated admin', async () => {
    const client = makeSequenceClient([{ data: {
      ...queueRow(queueId), status: 'resolved', resolved_by: adminId,
      resolved_at: '2026-08-07T01:00:00.000Z', resolution_note: 'Reviewed safely.',
    }, error: null }])

    const result = await resolveKaelAdminQueue(
      context('admin', client),
      queueId,
      { note: 'Reviewed safely.' },
    )

    expect(result).toMatchObject({ ok: true, item: { id: queueId, status: 'resolved' } })
    expect(client.calls[0].operations).toContainEqual([
      'update',
      expect.objectContaining({ resolved_by: adminId, status: 'resolved', resolution_note: 'Reviewed safely.' }),
    ])
    expect(client.calls[0].operations).toContainEqual(['in', 'status', ['open', 'acknowledged']])
  })

  it('blocks non-admin access before database I/O', async () => {
    const client = makeSequenceClient([])
    await expect(listKaelAdminQueue(context('customer', client), { page: 1, limit: 30 }))
      .rejects.toMatchObject({ status: 403 })
    await expect(listKaelEstimateAccuracy(
      context('worker', client),
      parseKaelEstimateAccuracyInput(new URL('https://example.test/admin/kael-estimate-accuracy')),
    )).rejects.toMatchObject({ status: 403 })
    expect(() => getKaelModelHealth(context('customer', client))).toThrow()
    expect(client.calls).toHaveLength(0)
  })

  it('reports model inventory from routing configuration without exposing key values', () => {
    vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'ANTHROPIC_API_KEY' ? 'secret-value' : undefined } })
    const result = getKaelModelHealth(context('admin', makeSequenceClient([])))

    expect(result.mode).toBe('configuration')
    expect(result.models.length).toBeGreaterThan(0)
    expect(JSON.stringify(result)).not.toContain('secret-value')
    expect(result.models.some((item) => item.provider === 'anthropic' && item.configured)).toBe(true)
  })
})

function queueRow(id: string) {
  return {
    id,
    actor_id: '11111111-1111-4111-8111-111111111111',
    job_id: null,
    queue_type: 'demanding_customer',
    priority: 'high',
    status: 'open',
    escalation_level: 'hard',
    reason_code: 'high_stakes',
    response_summary: 'Call 0901234567 for review.\n',
    safe_metadata: { purpose: 'price_synthesis', email: 'private@example.test' },
    created_at: '2026-08-07T00:00:00.000Z',
    updated_at: '2026-08-07T00:00:00.000Z',
    resolved_at: null,
    resolved_by: null,
    resolution_note: null,
  }
}

type Role = 'admin' | 'customer' | 'worker'
function context(role: Role, client: ReturnType<typeof makeSequenceClient>): MobileApiContext {
  return {
    success: true,
    user: { id: role === 'admin' ? adminId : '11111111-1111-4111-8111-111111111111' },
    role,
    supabase: client,
  }
}

type QueryResult = { data: unknown; error: { code?: string; message?: string } | null }
type QueryCall = { table: string; operations: Array<[string, ...unknown[]]> }

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
    select(columns?: string) { call.operations.push(['select', columns]); return query },
    update(value: unknown) { call.operations.push(['update', value]); return query },
    eq(column: string, value: unknown) { call.operations.push(['eq', column, value]); return query },
    in(column: string, value: unknown[]) { call.operations.push(['in', column, value]); return query },
    gte(column: string, value: unknown) { call.operations.push(['gte', column, value]); return query },
    lte(column: string, value: unknown) { call.operations.push(['lte', column, value]); return query },
    order(column: string, options?: unknown) { call.operations.push(['order', column, options]); return query },
    range(from: number, to: number) { call.operations.push(['range', from, to]); return query },
    limit(value: number) { call.operations.push(['limit', value]); return query },
    maybeSingle() { call.operations.push(['maybeSingle']); return query },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(results.shift() ?? { data: null, error: null }).then(onfulfilled, onrejected)
    },
  }
  return query
}
