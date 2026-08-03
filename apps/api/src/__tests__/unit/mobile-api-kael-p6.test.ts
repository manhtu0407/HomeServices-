import { describe, expect, it, vi } from 'vitest'
import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/domains'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/http'
import {
  classifyMemoryStaleness,
  KaelMemory,
  resolveMemoryFacts,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-memory/memory'
import { sanitizeMemoryObject } from '../../../../../supabase/functions/mobile-api/_shared/kael/kael-memory/memory-sanitizer'

describe('Kael P6 memory governance', () => {
  it('builds six memory layers with budget, privacy, PII filtering, and read audits', async () => {
    const client = makeTableClient({
      jobs: [{
        data: {
          id: 'job-1',
          customer_id: 'customer-1',
          worker_id: 'worker-1',
          kael_problem_identified: 'Ổ cắm cháy gần căn 12A, gọi 0901234567',
          kael_estimate_card_v3: { card: { problem_summary: 'Ổ cắm cháy' } },
        },
        error: null,
      }],
      customer_kael_memory: [{
        data: {
          customer_id: 'customer-1',
          preference_summary: 'Thích thợ đến nhanh, số 0901234567, căn 12A',
          service_preferences: { electrical: 'ưu tiên an toàn' },
          home_context: { unit: '12A', floor: '9' },
          last_observed_at: '2026-02-20T00:00:00.000Z',
        },
        error: null,
      }],
      learning_rules: [{
        data: [{
          id: 'rule-1',
          rule_type: 'safety',
          rule_payload: { service_preference: 'domain wins', advice: 'Ngắt điện trước khi kiểm tra' },
          status: 'active',
        }],
        error: null,
      }],
      chat_messages: [{
        data: [
          { sender_role: 'customer', content: 'SĐT 0901234567, nhờ kiểm tra nhanh' },
          { sender_role: 'kael', content: 'Kael đã ghi nhận phạm vi.' },
        ],
        error: null,
      }],
      kael_memory_audit: [
        { data: { id: 'audit-l3' }, error: null },
        { data: { id: 'audit-l5' }, error: null },
      ],
    })
    const memory = new KaelMemory(client, { now: new Date('2026-05-25T00:00:00.000Z') })
    memory.setShortTerm('service_preference', 'short term loses')

    const context = await memory.getContext({
      actor: 'customer',
      actorId: 'customer-1',
      jobId: 'job-1',
    })

    expect(Object.keys(context.layers)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6'])
    expect(context.layers.L1.included).toBe(true)
    expect(context.layers.L2.included).toBe(true)
    expect(context.layers.L3.included).toBe(true)
    expect(context.layers.L4.included).toBe(false)
    expect(context.layers.L5.included).toBe(true)
    expect(context.layers.L6.included).toBe(true)
    expect(context.total_tokens).toBeLessThanOrEqual(1500)
    expect(JSON.stringify(context)).not.toMatch(/0901234567|12A|tầng 9/i)
    expect(context.resolved_facts.service_preference).toBe('domain wins')
    expect(client.calls.filter((call) => call.table === 'kael_memory_audit')).toHaveLength(2)
  })

  it('keeps worker calls from reading detailed customer memory and allows only own worker memory', async () => {
    const client = makeTableClient({
      jobs: [{ data: { id: 'job-1', worker_id: 'worker-1', customer_id: 'customer-1' }, error: null }],
      worker_kael_memory: [{
        data: {
          worker_id: 'worker-1',
          service_skill_summary: 'Điện dân dụng tốt, CCCD 079123456789',
          reliability_signals: { punctual: true },
          last_observed_at: '2026-05-01T00:00:00.000Z',
        },
        error: null,
      }],
      learning_rules: [{ data: [], error: null }],
      chat_messages: [{ data: [], error: null }],
      kael_memory_audit: [
        { data: { id: 'audit-l4' }, error: null },
        { data: { id: 'audit-l5' }, error: null },
      ],
    })

    const context = await new KaelMemory(client).getContext({
      actor: 'worker',
      actorId: 'worker-1',
      jobId: 'job-1',
    })

    expect(context.layers.L3.included).toBe(false)
    expect(context.layers.L4.included).toBe(true)
    expect(JSON.stringify(context)).not.toContain('079123456789')
    expect(client.calls.some((call) => call.table === 'customer_kael_memory')).toBe(false)
  })

  it('resolves memory conflicts by L5 > L2 > L3/L4 > L1 and marks stale memory', () => {
    expect(resolveMemoryFacts([
      { layer: 'L1', facts: { service_preference: 'l1' } },
      { layer: 'L3', facts: { service_preference: 'l3' } },
      { layer: 'L2', facts: { service_preference: 'l2' } },
      { layer: 'L5', facts: { service_preference: 'l5' } },
    ])).toEqual({ service_preference: 'l5' })

    expect(classifyMemoryStaleness('2026-02-20T00:00:00.000Z', new Date('2026-05-25T00:00:00.000Z'))).toBe('stale')
    expect(classifyMemoryStaleness('2025-01-01T00:00:00.000Z', new Date('2026-05-25T00:00:00.000Z'))).toBe('archive')
  })

  it('adds B1 runtime knowledge tables to L5 domain memory only when the flag is enabled', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get: (name: string) => name === 'KAEL_OPT_KNOWLEDGE_RETRIEVAL_ENABLED' ? 'true' : undefined,
      },
    })
    try {
      const client = makeTableClient({
        learning_rules: [{ data: [], error: null }],
        service_knowledge_boxes: [{ data: [{
          service_type: 'plumbing',
          slug: 'plumbing',
          label_vi: 'Sua nuoc',
          purpose: 'Runtime service knowledge.',
          is_active: true,
        }], error: null }],
        worker_safety_patterns: [{ data: [{
          pattern_key: 'plumbing_floor_protection_before_repair',
          service_type: 'plumbing',
          trigger_topic: 'worker_safety_advisory',
          severity: 'warning',
          response_guidance: 'Khoa nuoc khu vuc lien quan truoc khi thao tac.',
        }], error: null }],
        legal_awareness_patterns: [{ data: [{
          pattern_key: 'professional_legal_advice_redirect',
          topic: 'legal_advice',
          boundary_type: 'redirect_required',
          response_guidance: 'Redirect legal advice requests.',
        }], error: null }],
        kael_memory_audit: [{ data: { id: 'audit-l5' }, error: null }],
      })

      const context = await new KaelMemory(client).getContext({
        actor: 'system',
        actorId: 'system',
      })

      expect(JSON.stringify(context.layers.L5.data)).toContain('worker_safety_patterns')
      expect(client.calls.map((call) => call.table)).toContain('service_knowledge_boxes')
      expect(client.calls.map((call) => call.table)).toContain('legal_awareness_patterns')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('returns sanitized self-view memory and denies cross-user reads by construction', async () => {
    const client = makeTableClient({
      customer_kael_memory: [{
        data: {
          customer_id: 'customer-1',
          preference_summary: 'Gọi 0901234567, căn 12A',
          service_preferences: { plumbing: 'nhanh' },
          home_context: { unit: '12A' },
        },
        error: null,
      }],
      kael_memory_audit: [{ data: { id: 'audit-1' }, error: null }],
    })
    const ctx = makeCtx('customer', 'customer-1', client)

    await expect(createEdgeServices({}).getMyKaelMemory(ctx)).resolves.toMatchObject({
      subject_type: 'customer',
      memory: expect.objectContaining({
        customer_id: 'customer-1',
      }),
    })

    expect(JSON.stringify(client.calls)).toContain('"eq","customer_id","customer-1"')
    expect(JSON.stringify(client.calls)).not.toContain('other-customer')
  })

  it('deletes the caller memory row and writes a memory audit', async () => {
    const client = makeTableClient({
      customer_kael_memory: [{ data: null, error: null }],
      kael_memory_audit: [{ data: { id: 'audit-delete' }, error: null }],
    })
    const ctx = makeCtx('customer', 'customer-1', client)

    await expect(createEdgeServices({}).deleteMyKaelMemory(ctx)).resolves.toEqual({
      subject_type: 'customer',
      deleted: true,
    })

    expect(client.calls).toContainEqual(expect.objectContaining({
      table: 'customer_kael_memory',
      operations: expect.arrayContaining([
        ['delete'],
        ['eq', 'customer_id', 'customer-1'],
      ]),
    }))
    expect(client.calls).toContainEqual(expect.objectContaining({
      table: 'kael_memory_audit',
      operations: expect.arrayContaining([
        ['insert', expect.objectContaining({ operation: 'delete', subject_type: 'customer' })],
      ]),
    }))
  })

  it('sanitizes memory objects with strict PII stripping', () => {
    expect(sanitizeMemoryObject({
      phone: '0901234567',
      cccd: '079123456789',
      address: 'căn 12A tầng 9',
      note: 'khách muốn kiểm tra an toàn',
    })).toEqual({
      phone: '[phone]',
      cccd: '[id-number]',
      address: '[unit] [floor]',
      note: 'khách muốn kiểm tra an toàn',
    })
  })
})

type QueryResult = { data: unknown; error: { code?: string; message?: string } | null }
type QueryCall = { table: string; operations: unknown[][] }

function makeCtx(role: 'customer' | 'worker' | 'admin', userId: string, supabase: unknown): MobileApiContext {
  return {
    success: true,
    user: { id: userId },
    role,
    supabase,
  } as MobileApiContext
}

function makeTableClient(resultsByTable: Record<string, QueryResult[]>) {
  const calls: QueryCall[] = []
  return {
    calls,
    from(table: string) {
      const call: QueryCall = { table, operations: [] }
      calls.push(call)
      return makeQuery(call, resultsByTable[table] ?? [])
    },
  }
}

function makeQuery(call: QueryCall, results: QueryResult[]) {
  const query = {
    select(columns?: string, options?: unknown) {
      call.operations.push(options === undefined ? ['select', columns] : ['select', columns, options])
      return query
    },
    insert(value: unknown) {
      call.operations.push(['insert', value])
      return query
    },
    delete() {
      call.operations.push(['delete'])
      return query
    },
    eq(column: string, value: unknown) {
      call.operations.push(['eq', column, value])
      return query
    },
    order(column: string, options?: unknown) {
      call.operations.push(['order', column, options])
      return query
    },
    limit(count: number) {
      call.operations.push(['limit', count])
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
      const next = results.shift() ?? { data: null, error: null }
      return Promise.resolve(next).then(onfulfilled, onrejected)
    },
  }
  return query
}
