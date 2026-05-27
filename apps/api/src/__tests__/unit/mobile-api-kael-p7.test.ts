import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/services'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'
import {
  ALLOWED_LEARNING_TARGETS,
  FORBIDDEN_LEARNING_EFFECTS,
  KAEL_LEARNING_SKILLS,
  createLearningSkillCandidate,
  enforceLearningScopeLimits,
  evaluateLearningEvidenceGate,
  getLearningSkill,
  listLearningSkills,
  planLearningSkillTriggers,
  queueLearningSkillTriggers,
  recordLearningPerformanceSample,
  resolveLearningRuntimeConfig,
  shouldAutoRollbackLearningRule,
  shouldRunLearningForActor,
  transitionLearningLifecycle,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/skills/registry'
import type { LearningSkillInput } from '../../../../../supabase/functions/mobile-api/_shared/kael/skills/registry'

describe('Kael P7 learning skill setup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('T7-test-1: registers LS1-LS7 with immutable scope constants', () => {
    expect(KAEL_LEARNING_SKILLS.map((skill) => skill.id)).toEqual([
      'LS1',
      'LS2',
      'LS3',
      'LS4',
      'LS5',
      'LS6',
      'LS7',
    ])
    expect(listLearningSkills()).toHaveLength(7)
    expect(getLearningSkill('LS1')?.name).toBe('Price prior learning')
    expect(FORBIDDEN_LEARNING_EFFECTS).toContain('auto_charge_payment')
    expect(FORBIDDEN_LEARNING_EFFECTS).toContain('auto_change_final_price')
    expect(ALLOWED_LEARNING_TARGETS).toEqual([
      'analysis_prompt',
      'price_prior',
      'clarification_pattern',
      'advisory_pattern',
      'detection_pattern',
      'intent_category',
    ])
  })

  it('T7-test-2: each learning skill trigger creates a valid bounded candidate', () => {
    for (const skill of KAEL_LEARNING_SKILLS) {
      const candidate = createLearningSkillCandidate(skill.id, learningInput())
      expect(candidate.skill_id).toBe(skill.id)
      expect(candidate.prompt_version).toBe(skill.prompt.version)
      expect(ALLOWED_LEARNING_TARGETS).toContain(candidate.target)
      expect(candidate.effects).toEqual([])
      expect(skill.outputs_schema.safeParse(candidate).success).toBe(true)
    }
  })

  it('T7-test-3: evidence gate does not promote below the minimum count', () => {
    const decision = evaluateLearningEvidenceGate(getLearningSkill('LS1')!, {
      evidence_count: 4,
      confidence: 0.95,
      completed_transaction_count: 4,
      recent_contradiction_ratio: 0,
    })

    expect(decision).toEqual({
      promote: false,
      next_state: 'pending_evidence',
      reason: 'insufficient_evidence',
    })
  })

  it('T7-test-4: evidence gate auto-promotes automatic skills and queues manual skills', () => {
    expect(evaluateLearningEvidenceGate(getLearningSkill('LS1')!, gatePass()).next_state)
      .toBe('auto_promoted')
    expect(evaluateLearningEvidenceGate(getLearningSkill('LS5')!, gatePass()).next_state)
      .toBe('manual_review')
  })

  it('T7-test-5: scope limits reject forbidden effects with audit metadata', () => {
    const skill = getLearningSkill('LS1')!
    const candidate = {
      ...createLearningSkillCandidate('LS1', learningInput()),
      effects: ['auto_charge_payment'] as const,
    }

    const decision = enforceLearningScopeLimits(skill, candidate)

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.reason).toBe('forbidden_effect')
      expect(decision.audit.safe_metadata.effect).toBe('auto_charge_payment')
    }
  })

  it('T7-test-6: lifecycle state machine accepts only forward plan transitions', () => {
    expect(transitionLearningLifecycle('candidate', 'pending_evidence')).toEqual({ valid: true })
    expect(transitionLearningLifecycle('pending_evidence', 'evidence_gate_check')).toEqual({ valid: true })
    expect(transitionLearningLifecycle('evidence_gate_check', 'manual_review')).toEqual({ valid: true })
    expect(transitionLearningLifecycle('active', 'candidate')).toEqual({
      valid: false,
      reason: 'invalid_transition',
    })
  })

  it('T7-test-7: performance monitoring tracks apply, override, accuracy, and satisfaction', () => {
    expect(recordLearningPerformanceSample('rule-1', {
      applied: true,
      overridden: false,
      accuracy_delta: 0.08,
      satisfaction_delta: 0.4,
    })).toEqual({
      rule_id: 'rule-1',
      applied_count: 1,
      override_count: 0,
      accuracy_delta: 0.08,
      satisfaction_delta: 0.4,
    })
  })

  it('T7-test-8: auto-rollback degrades a rule when monitored quality drops', () => {
    expect(shouldAutoRollbackLearningRule(getLearningSkill('LS1')!, {
      accuracy_drop_pct: 11,
      satisfaction_drop_pts: 0.4,
      monitor_window_days: 30,
    })).toBe(true)
  })

  it('T7-test-9: manual review skills LS5-LS7 are queued, never auto-applied', () => {
    const postA14 = planLearningSkillTriggers('post-A14', learningInput(), enabledConfig())
    const adminSafety = planLearningSkillTriggers('admin-safety-tag', learningInput(), enabledConfig())
    const decline = planLearningSkillTriggers('post-decline', learningInput(), enabledConfig())
    const manual = [...postA14, ...adminSafety, ...decline]
      .filter((item) => ['LS5', 'LS6', 'LS7'].includes(item.skill.id))

    expect(manual.map((item) => item.skill.id).sort()).toEqual(['LS5', 'LS6', 'LS7'])
    expect(manual.every((item) => item.queue_state === 'manual_review')).toBe(true)
  })

  it('T7-test-10: kill switch disables every learning trigger', () => {
    const config = resolveLearningRuntimeConfig((name) => ({
      KAEL_LEARNING_READ_ENABLED: 'true',
      KAEL_LEARNING_WRITE_ENABLED: 'true',
      KAEL_LEARNING_KILL_SWITCH: 'true',
      KAEL_LEARNING_AB_PERCENTAGE: '100',
      KAEL_LEARNING_AUTO_ROLLBACK: 'true',
    })[name], 'customer-1')

    expect(config.enabled_for_actor).toBe(false)
    expect(planLearningSkillTriggers('post-A14', learningInput(), config)).toEqual([])
  })

  it('T7-test-11: A/B percentage gates actors deterministically', () => {
    const config = resolveLearningRuntimeConfig((name) => ({
      KAEL_LEARNING_READ_ENABLED: 'true',
      KAEL_LEARNING_WRITE_ENABLED: 'true',
      KAEL_LEARNING_AB_PERCENTAGE: '50',
    })[name], 'actor-1')
    const enabledCount = Array.from({ length: 100 }, (_, index) =>
      shouldRunLearningForActor(`actor-${index}`, config)
    ).filter(Boolean).length

    expect(enabledCount).toBeGreaterThanOrEqual(40)
    expect(enabledCount).toBeLessThanOrEqual(60)
  })

  it('T7-test-12: security rejects auto-charge or money-impacting learning attempts', () => {
    const skill = getLearningSkill('LS2')!
    const decision = enforceLearningScopeLimits(skill, {
      ...createLearningSkillCandidate('LS2', learningInput()),
      target: 'analysis_prompt',
      effects: ['auto_change_final_price'] as const,
    })

    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.audit.event_type).toBe('learning_scope_rejected')
  })

  it('T7-test-13: one reviewed job queues multiple skills without executing them inline', async () => {
    const client = makeSequenceClient([{ data: null, error: null }])

    const summary = await queueLearningSkillTriggers(
      client,
      'post-A14',
      learningInput({ actor_id: 'customer-1' }),
      enabledConfig(),
    )

    expect(summary.queued + summary.manual_review).toBe(4)
    expect(summary.skill_ids.sort()).toEqual(['LS1', 'LS2', 'LS4', 'LS5'])
    expect(client.calls).toHaveLength(1)
    expect(client.calls[0].table).toBe('kael_rule_lifecycle_log')
    expect(JSON.stringify(client.calls)).not.toContain('raw comment')
  })

  it('wires Edge review completion to enqueue post-A14 learning work when write flag is enabled', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get(name: string) {
          return ({
            KAEL_LEARNING_READ_ENABLED: 'true',
            KAEL_LEARNING_WRITE_ENABLED: 'true',
            KAEL_LEARNING_AB_PERCENTAGE: '100',
          } as Record<string, string>)[name]
        },
      },
    })
    const client = makeSequenceClient([
      { data: { id: 'job-1', customer_id: 'customer-1', worker_id: 'worker-1' }, error: null },
      {
        data: [{
          ok: true,
          review_id: 'review-1',
          job_status: 'reviewed',
          error_code: null,
        }],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null },
    ])
    const ctx = makeCtx('customer', 'customer-1', client)

    await expect(createEdgeServices({}).submitReview(ctx, 'job-1', {
      rating: 5,
      tags: ['on_time'],
      comment: 'raw comment with phone 0901234567',
    })).resolves.toMatchObject({
      review_id: 'review-1',
      status: 'reviewed',
    })

    const queueCall = client.calls.find((call) => call.table === 'kael_rule_lifecycle_log')
    expect(queueCall?.operations).toContainEqual([
      'insert',
      expect.arrayContaining([
        expect.objectContaining({
          skill_id: 'LS1',
          job_id: 'job-1',
          next_state: 'candidate',
        }),
        expect.objectContaining({
          skill_id: 'LS5',
          next_state: 'manual_review',
        }),
      ]),
    ])
    expect(JSON.stringify(queueCall)).not.toContain('0901234567')
  })
})

function gatePass() {
  return {
    evidence_count: 5,
    confidence: 0.72,
    completed_transaction_count: 5,
    recent_contradiction_ratio: 0,
  }
}

function enabledConfig() {
  return resolveLearningRuntimeConfig((name) => ({
    KAEL_LEARNING_READ_ENABLED: 'true',
    KAEL_LEARNING_WRITE_ENABLED: 'true',
    KAEL_LEARNING_KILL_SWITCH: 'false',
    KAEL_LEARNING_AB_PERCENTAGE: '100',
    KAEL_LEARNING_AUTO_ROLLBACK: 'true',
  })[name], 'customer-1')
}

function learningInput(overrides: Partial<LearningSkillInput> = {}): LearningSkillInput {
  return {
    actor_id: 'customer-1',
    job_id: 'job-1',
    customer_id: 'customer-1',
    worker_id: 'worker-1',
    service_type: 'plumbing',
    problem_slug: 'pipe_leak',
    district_code: 'q7',
    complexity: 'medium',
    baseline_min: 200000,
    baseline_max: 400000,
    final_price: 350000,
    rating: 5,
    review_tags: ['on_time'],
    scope_change_requested: false,
    reviewed_at: '2026-05-25T00:00:00.000Z',
    worker_report: {
      has_photos: true,
      reported_complexity: 'medium',
    },
    decline_reason: 'outside_scope',
    feedback_present: true,
    ...overrides,
  }
}

function makeCtx(role: 'customer' | 'worker' | 'admin', userId: string, supabase: unknown): MobileApiContext {
  return {
    success: true,
    user: { id: userId },
    role,
    supabase,
  } as MobileApiContext
}

type QueryFulfilled =
  { data: unknown; error: { code?: string; message?: string } | null; count?: number | null }
type QueryResult =
  | QueryFulfilled
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
    rpc(name: string, args?: Record<string, unknown>) {
      const call: QueryCall = { table: `rpc:${name}`, operations: [['rpc', name, args]] }
      calls.push(call)
      return makeQuery(call, results)
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
    upsert(value: unknown) {
      call.operations.push(['upsert', value])
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
    maybeSingle() {
      call.operations.push(['maybeSingle'])
      return query
    },
    single() {
      call.operations.push(['single'])
      return query
    },
    then<TResult1 = QueryFulfilled, TResult2 = never>(
      onfulfilled?: ((value: QueryFulfilled) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      const next = results.shift() ?? { data: null, error: null }
      if ('reject' in next) {
        return Promise.reject(next.reject).then(onfulfilled, onrejected)
      }
      return Promise.resolve(next).then(onfulfilled, onrejected)
    },
  }
  return query
}
