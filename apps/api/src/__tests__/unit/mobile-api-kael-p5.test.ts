import { describe, expect, it, vi, beforeEach } from 'vitest'
import { evaluateKaelPermissionGate, auditKaelPermissionDecision } from '../../../../../supabase/functions/mobile-api/_shared/kael/permission-gate'
import { checkKaelActorRateLimit, recordKaelCostForTests, resetKaelRateLimitForTests } from '../../../../../supabase/functions/mobile-api/_shared/kael/rate-limit'
import { runKaelPurposeStage } from '../../../../../supabase/functions/mobile-api/_shared/kael/orchestrator'

describe('Kael P5 permission scope and response policy', () => {
  beforeEach(() => {
    resetKaelRateLimitForTests()
  })

  it('allows legal awareness education while declining legal advice before any LLM call', async () => {
    expect(evaluateKaelPermissionGate({
      purpose: 'educational_response',
      actor: 'customer',
      jobRelation: 'none',
      topic: 'legal_safety_awareness',
      action: 'generate_advisory',
    })).toMatchObject({
      allowed: true,
      reasonCode: 'ALLOW_EDUCATIONAL_RESPONSE',
    })

    const run = vi.fn(async () => 'LLM should not run')
    const result = await runKaelPurposeStage({
      label: 'legal-advice',
      purpose: 'educational_response',
      timeoutMs: 100,
      permission: {
        check: () => evaluateKaelPermissionGate({
          purpose: 'educational_response',
          actor: 'customer',
          jobRelation: 'none',
          topic: 'legal_advice',
          action: 'generate_advisory',
        }),
      },
      run,
    })

    expect(run).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      success: true,
      fallbackUsed: true,
      failureReason: 'DENY_LEGAL_ADVICE',
      value: expect.objectContaining({
        decline_template_key: 'legal_advice_redirect',
      }),
    })
  })

  it('declines unsupported AC service requests with a Vietnamese template', () => {
    const decision = evaluateKaelPermissionGate({
      purpose: 'clarification',
      actor: 'customer',
      jobRelation: 'none',
      topic: 'out_of_scope_services_anything',
      action: 'ask_clarification',
    })

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'DENY_OUT_OF_SCOPE_SERVICE',
      declineTemplateKey: 'out_of_scope_service',
    })
    expect(decision.responseText).toContain('sửa điện')
    expect(decision.responseText).toContain('sửa nước')
    expect(decision.responseText).toContain('dọn dẹp')
  })

  it('blocks worker pre-accept PII and inserts an append-only permission audit row', async () => {
    const decision = evaluateKaelPermissionGate({
      purpose: 'worker_brief',
      actor: 'worker',
      jobRelation: 'none',
      topic: 'other_jobs_specific',
      action: 'generate_worker_brief',
      jobId: 'job-1',
      actorId: 'worker-1',
    })
    const client = makeSequenceClient([{ data: { id: 'audit-1' }, error: null }])

    await auditKaelPermissionDecision(client, decision)

    expect(decision).toMatchObject({
      allowed: false,
      reasonCode: 'DENY_WORKER_PRE_ACCEPT_PII',
    })
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0]).toMatchObject({ table: 'kael_permission_audit' })
    expect(client.calls[0].operations).toContainEqual([
      'insert',
      expect.objectContaining({
        job_id: 'job-1',
        actor_id: 'worker-1',
        actor_role: 'worker',
        purpose: 'worker_brief',
        decision: 'deny',
        reason_code: 'DENY_WORKER_PRE_ACCEPT_PII',
      }),
    ])
  })

  it('enforces worker brief rate limit without running the LLM stage', async () => {
    const request = {
      actor: 'worker' as const,
      actorId: 'worker-1',
      action: 'worker_brief_clarification' as const,
      jobId: 'job-1',
    }

    expect(checkKaelActorRateLimit(request)).toMatchObject({ allowed: true })
    expect(checkKaelActorRateLimit(request)).toMatchObject({ allowed: true })
    expect(checkKaelActorRateLimit(request)).toMatchObject({ allowed: true })
    const blocked = checkKaelActorRateLimit(request)
    const run = vi.fn(async () => 'LLM should not run')

    const result = await runKaelPurposeStage({
      label: 'worker-brief-clarify',
      purpose: 'worker_brief',
      timeoutMs: 100,
      permission: {
        check: () => blocked,
      },
      run,
    })

    expect(blocked).toMatchObject({
      allowed: false,
      reasonCode: 'RATE_LIMIT_HIT',
      declineTemplateKey: 'rate_limit_hit',
    })
    expect(run).not.toHaveBeenCalled()
    expect(result.value).toMatchObject({
      decline_template_key: 'rate_limit_hit',
    })
  })

  it('enforces customer monthly cost cap and writes advisory audit metadata', async () => {
    recordKaelCostForTests('customer', 'customer-1', 'customer_full_estimate_request', 4.99)
    const blocked = checkKaelActorRateLimit({
      actor: 'customer',
      actorId: 'customer-1',
      action: 'customer_full_estimate_request',
      estimatedCostUsd: 0.02,
    })
    const client = makeSequenceClient([{ data: { id: 'advisory-1' }, error: null }])

    await auditKaelPermissionDecision(client, {
      ...blocked,
      purpose: 'price_synthesis',
      action: 'synthesize_price',
      topic: 'price_estimate',
      actor: 'customer',
      actorId: 'customer-1',
      jobId: 'job-1',
      jobRelation: 'own_customer_job',
    })

    expect(blocked).toMatchObject({
      allowed: false,
      reasonCode: 'COST_CAP_HIT',
      declineTemplateKey: 'cost_cap_hit',
    })
    expect(client.calls[0]).toMatchObject({ table: 'kael_advisory_audit' })
    expect(client.calls[0].operations).toContainEqual([
      'insert',
      expect.objectContaining({
        purpose: 'price_synthesis',
        advisory_type: 'cost_cap_hit',
        template_key: 'cost_cap_hit',
        safe_metadata: expect.objectContaining({
          reason_code: 'COST_CAP_HIT',
        }),
      }),
    ])
  })
})

type QueryResult =
  | { data: unknown; error: { code?: string; message?: string } | null }
  | { reject: unknown }
type QueryCall = { table: string; operations: unknown[][] }

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
    insert(value: unknown) {
      call.operations.push(['insert', value])
      return query
    },
    select(columns?: string) {
      call.operations.push(['select', columns])
      return query
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      const next = results.shift() ?? { data: null, error: null }
      if ('reject' in next) return Promise.reject(next.reject).then(onfulfilled, onrejected)
      return Promise.resolve(next).then(onfulfilled, onrejected)
    },
  }
  return query
}
