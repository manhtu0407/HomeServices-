import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEdgeServices } from '../../../../../supabase/functions/mobile-api/_shared/services'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'
import { monitorLearningRules } from '../../../../../supabase/functions/mobile-api/_shared/kael/cron/monitor-learning-rules'
import {
  recordLearningReviewOutcome,
  recordLearningRuleApplication,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/learning'
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
    vi.restoreAllMocks()
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

  it('accepts the repository boolean aliases for learning flags and the emergency kill switch', async () => {
    const enabled = resolveLearningRuntimeConfig((name) => ({
      KAEL_LEARNING_READ_ENABLED: 'on',
      KAEL_LEARNING_WRITE_ENABLED: 'yes',
      KAEL_LEARNING_KILL_SWITCH: '0',
      KAEL_LEARNING_AB_PERCENTAGE: '100',
    })[name], 'customer-1')
    expect(enabled).toMatchObject({
      read_enabled: true,
      write_enabled: true,
      kill_switch: false,
      enabled_for_actor: true,
    })

    vi.stubGlobal('Deno', {
      env: {
        get(name: string) {
          return ({
            KAEL_LEARNING_READ_ENABLED: 'true',
            KAEL_LEARNING_WRITE_ENABLED: 'true',
            KAEL_LEARNING_KILL_SWITCH: '1',
          } as Record<string, string>)[name]
        },
      },
    })
    const client = makeSequenceClient([
      { data: [{ id: 'must-not-be-read' }], error: null },
    ])

    await expect(recordLearningReviewOutcome(client as never, {
      jobId: 'job-kill-switch',
      finalPrice: 300000,
      rating: 5,
    })).resolves.toEqual({ source_applications: 0, inserted_samples: 0 })
    expect(client.calls).toEqual([])
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

  it('reports a resolved manual-review notification error without failing the queued work', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const client = makeSequenceClient([
      { data: null, error: null },
      { data: null, error: { code: 'NOTIFY_DENIED' } },
    ])

    const summary = await queueLearningSkillTriggers(
      client,
      'post-A14',
      learningInput({ admin_user_id: 'admin-1' }),
      enabledConfig(),
    )

    expect(summary.queued + summary.manual_review).toBe(4)
    expect(warn).toHaveBeenCalledWith('kael learning manual-review notification failed', {
      errorCode: 'NOTIFY_DENIED',
    })
  })

  it('reports a rejected manual-review notification transport without failing the queued work', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const client = makeSequenceClient([
      { data: null, error: null },
      { reject: new Error('private transport detail') },
    ])

    const summary = await queueLearningSkillTriggers(
      client,
      'post-A14',
      learningInput({ admin_user_id: 'admin-1' }),
      enabledConfig(),
    )

    expect(summary.queued + summary.manual_review).toBe(4)
    expect(warn).toHaveBeenCalledWith('kael learning manual-review notification failed', {
      errorCode: 'NOTIFICATION_FAILED',
    })
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
      { data: { id: 'job-1', status: 'paid', customer_id: 'customer-1', worker_id: 'worker-1', service_type: 'electrical' }, error: null },
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

  it('A3 records rule application and review outcome samples without raw review text', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get(name: string) {
          return ({
            KAEL_LEARNING_READ_ENABLED: 'true',
            KAEL_LEARNING_WRITE_ENABLED: 'true',
            KAEL_LEARNING_KILL_SWITCH: 'false',
          } as Record<string, string>)[name]
        },
      },
    })
    const client = makeSequenceClient([
      { data: null, error: null },
      {
        data: [{
          id: 'application-1',
          rule_id: 'rule-1',
          skill_id: 'LS1',
          applied_target: 'price_prior',
          safe_metadata: {
            applied_price_min: 200000,
            applied_price_max: 300000,
          },
        }],
        error: null,
      },
      {
        data: [
          { safe_metadata: { rating: 5 } },
          { safe_metadata: { rating: 4 } },
          { safe_metadata: { rating: 5 } },
        ],
        error: null,
      },
      { data: null, error: null },
    ])

    await expect(recordLearningRuleApplication(client as never, {
      ruleId: 'rule-1',
      ruleVersion: 2,
      skillId: 'LS1',
      jobId: 'job-1',
      actorRole: 'system',
      appliedTarget: 'price_prior',
      safeMetadata: {
        applied_price_min: 200000,
        applied_price_max: 300000,
      },
    })).resolves.toEqual({ inserted: true })
    await expect(recordLearningReviewOutcome(client as never, {
      jobId: 'job-1',
      finalPrice: 360000,
      rating: 3,
    })).resolves.toEqual({ source_applications: 1, inserted_samples: 1 })

    const applicationInsert = client.calls[0]
    expect(applicationInsert.table).toBe('kael_rule_application_log')
    expect(applicationInsert.operations).toContainEqual([
      'insert',
      expect.objectContaining({
        applied_count: 1,
        override_count: 0,
        safe_metadata: expect.objectContaining({
          applied_price_min: 200000,
          applied_price_max: 300000,
        }),
      }),
    ])
    const outcomeInsert = client.calls[3]
    expect(outcomeInsert.operations).toContainEqual([
      'insert',
      expect.arrayContaining([
        expect.objectContaining({
          override_count: 1,
          accuracy_delta: 0.2,
          // Drop in rating points vs the prior-sample baseline:
          // mean(5, 4, 5) - 3 = 1.667.
          satisfaction_delta: 1.667,
          safe_metadata: expect.objectContaining({
            source: 'review_outcome',
            rating: 3,
          }),
        }),
      ]),
    ])
    expect(JSON.stringify(client.calls)).not.toContain('raw comment')
  })

  it('A3 monitor rolls back degraded active rules through the service-role RPC', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get(name: string) {
          return ({
            KAEL_LEARNING_READ_ENABLED: 'true',
            KAEL_LEARNING_WRITE_ENABLED: 'true',
            KAEL_LEARNING_AB_PERCENTAGE: '100',
            KAEL_LEARNING_AUTO_ROLLBACK: 'true',
          } as Record<string, string>)[name]
        },
      },
    })
    const client = makeSequenceClient([
      {
        data: [{
          id: 'rule-1',
          rule_type: 'price_prior_update',
          status: 'active',
          rollback_available: true,
        }],
        error: null,
      },
      {
        data: [
          { rule_id: 'rule-1', skill_id: 'LS1', applied_count: 1, override_count: 1, accuracy_delta: 0.12, satisfaction_delta: 0.4 },
          { rule_id: 'rule-1', skill_id: 'LS1', applied_count: 1, override_count: 1, accuracy_delta: 0.14, satisfaction_delta: 0.35 },
        ],
        error: null,
      },
      { data: [{ ok: true, error_code: null, rule_id: 'rule-1' }], error: null },
      { data: [{ id: 'candidate-stale', status: 'manual_review', created_at: '2026-05-30T00:00:00.000Z' }], error: null },
      { data: [{ id: 'queue-failed', queue_state: 'failed', error_code: 'BATCH_SUBMIT_FAILED' }], error: null },
      { data: [{ id: 'batch-failed', status: 'failed', error_code: 'REMOTE_ERROR' }], error: null },
    ])

    await expect(monitorLearningRules(client, {
      now: new Date('2026-06-04T00:00:00.000Z'),
      limit: 5,
    })).resolves.toEqual({
      checked: 1,
      monitored: 1,
      rolled_back: 1,
      loop_health: expect.objectContaining({
        manual_review_sla_days: 3,
        manual_review_overdue_count: 1,
        manual_review_overdue_ids: ['candidate-stale'],
        failed_queue_count: 1,
        failed_queue_ids: ['queue-failed'],
        failed_batch_count: 1,
        failed_batch_ids: ['batch-failed'],
        error_codes: [],
      }),
    })

    const rollbackRpc = client.calls.find((call) => call.table === 'rpc:rollback_learning_rule')
    expect(rollbackRpc?.operations).toContainEqual([
      'rpc',
      'rollback_learning_rule',
      expect.objectContaining({
        p_rule_id: 'rule-1',
        p_skill_id: 'LS1',
        p_reason: 'monitorLearningRules',
        p_safe_metadata: expect.objectContaining({
          accuracy_drop_pct: 13,
          satisfaction_drop_pts: 0.375,
        }),
      }),
    ])
  })

  it('A3 monitor respects the auto-rollback flag before reading rules', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get(name: string) {
          return ({
            KAEL_LEARNING_READ_ENABLED: 'true',
            KAEL_LEARNING_WRITE_ENABLED: 'true',
            KAEL_LEARNING_AB_PERCENTAGE: '100',
            KAEL_LEARNING_AUTO_ROLLBACK: 'false',
          } as Record<string, string>)[name]
        },
      },
    })
    const client = makeSequenceClient([])

    await expect(monitorLearningRules(client)).resolves.toEqual({
      checked: 0,
      monitored: 0,
      rolled_back: 0,
      skipped_reason: 'auto_rollback_disabled',
    })
    expect(client.calls).toHaveLength(0)
  })

  it('A3 monitor surfaces rule-application read failures instead of reporting a clean pass', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get(name: string) {
          return ({
            KAEL_LEARNING_READ_ENABLED: 'true',
            KAEL_LEARNING_WRITE_ENABLED: 'true',
            KAEL_LEARNING_AB_PERCENTAGE: '100',
            KAEL_LEARNING_AUTO_ROLLBACK: 'true',
          } as Record<string, string>)[name]
        },
      },
    })
    const client = makeSequenceClient([
      {
        data: [{
          id: 'rule-1',
          rule_type: 'price_prior_update',
          status: 'active',
          rollback_available: true,
        }],
        error: null,
      },
      { data: null, error: { code: 'RULE_APPLICATION_READ_FAILED' } },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ])

    await expect(monitorLearningRules(client)).resolves.toMatchObject({
      checked: 1,
      monitored: 0,
      rolled_back: 0,
      error_code: 'RULE_APPLICATION_READ_FAILED',
    })
  })

  it('A3 monitor surfaces rollback transport failures instead of silently skipping them', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get(name: string) {
          return ({
            KAEL_LEARNING_READ_ENABLED: 'true',
            KAEL_LEARNING_WRITE_ENABLED: 'true',
            KAEL_LEARNING_AB_PERCENTAGE: '100',
            KAEL_LEARNING_AUTO_ROLLBACK: 'true',
          } as Record<string, string>)[name]
        },
      },
    })
    const client = makeSequenceClient([
      {
        data: [{
          id: 'rule-1',
          rule_type: 'price_prior_update',
          status: 'active',
          rollback_available: true,
        }],
        error: null,
      },
      {
        data: [
          { rule_id: 'rule-1', skill_id: 'LS1', applied_count: 2, override_count: 2, accuracy_delta: 0.2, satisfaction_delta: 0.5 },
        ],
        error: null,
      },
      { data: null, error: { code: 'ROLLBACK_RPC_FAILED' } },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ])

    await expect(monitorLearningRules(client)).resolves.toMatchObject({
      checked: 1,
      monitored: 1,
      rolled_back: 0,
      error_code: 'ROLLBACK_RPC_FAILED',
    })
  })

  it('A3 monitor surfaces non-benign rollback RPC decisions', async () => {
    vi.stubGlobal('Deno', {
      env: {
        get(name: string) {
          return ({
            KAEL_LEARNING_READ_ENABLED: 'true',
            KAEL_LEARNING_WRITE_ENABLED: 'true',
            KAEL_LEARNING_AB_PERCENTAGE: '100',
            KAEL_LEARNING_AUTO_ROLLBACK: 'true',
          } as Record<string, string>)[name]
        },
      },
    })
    const client = makeSequenceClient([
      {
        data: [{
          id: 'rule-1',
          rule_type: 'price_prior_update',
          status: 'active',
          rollback_available: true,
        }],
        error: null,
      },
      {
        data: [
          { rule_id: 'rule-1', skill_id: 'LS1', applied_count: 2, override_count: 2, accuracy_delta: 0.2, satisfaction_delta: 0.5 },
        ],
        error: null,
      },
      { data: [{ ok: false, error_code: 'RULE_NOT_FOUND', rule_id: null }], error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ])

    await expect(monitorLearningRules(client)).resolves.toMatchObject({
      checked: 1,
      monitored: 1,
      rolled_back: 0,
      error_code: 'RULE_NOT_FOUND',
    })
  })

  it('A4 admin lists and reviews manual learning candidates through review RPCs', async () => {
    const client = makeSequenceClient([
      {
        data: [{
          id: 'candidate-1',
          candidate_type: 'service_knowledge_candidate',
          affected_service: 'cleaning',
          affected_problem: 'deep_clean',
          affected_district: 'q7',
          suggested_payload: {
            skill_id: 'LS5',
            evidence_snapshot: { evidence_count: 3 },
          },
          confidence: 0.7,
          evidence_count: 3,
          status: 'manual_review',
          audit_reason: null,
          created_at: '2026-06-04T00:00:00.000Z',
          updated_at: '2026-06-04T00:00:00.000Z',
          promoted_at: null,
          rolled_back_at: null,
        }],
        error: null,
      },
      {
        data: [{
          ok: true,
          error_code: null,
          candidate_id: 'candidate-1',
          rule_id: 'rule-1',
          rule_version: 1,
          status: 'auto_promoted',
          knowledge_ok: true,
          knowledge_error_code: null,
          knowledge_table: 'service_knowledge_boxes',
          record_key: 'cleaning',
          knowledge_version: 2,
        }],
        error: null,
      },
      {
        data: [{
          ok: true,
          error_code: null,
          candidate_id: 'candidate-2',
          status: 'archived',
        }],
        error: null,
      },
    ])
    const services = createEdgeServices({})
    const ctx = makeCtx('admin', 'admin-1', client)

    await expect(services.listKaelLearningCandidates(ctx, {
      state: 'manual_review',
      limit: 5,
    })).resolves.toMatchObject({
      candidates: [{
        id: 'candidate-1',
        status: 'manual_review',
        evidence_snapshot: { evidence_count: 3 },
      }],
    })
    await expect(services.approveKaelLearningCandidate(ctx, 'candidate-1', {
      review_note: 'approved',
    })).resolves.toMatchObject({
      ok: true,
      candidate_id: 'candidate-1',
      rule_id: 'rule-1',
      rule_version: 1,
      knowledge_apply: {
        ok: true,
        knowledge_table: 'service_knowledge_boxes',
        record_key: 'cleaning',
        knowledge_version: 2,
      },
    })
    await expect(services.rejectKaelLearningCandidate(ctx, 'candidate-2', {
      reason: 'insufficient_evidence',
    })).resolves.toMatchObject({
      ok: true,
      candidate_id: 'candidate-2',
      status: 'archived',
    })

    expect(client.calls[0]).toMatchObject({ table: 'learning_candidates' })
    expect(client.calls[0].operations).toContainEqual(['eq', 'status', 'manual_review'])
    expect(client.calls.find((call) => call.table === 'learning_rules')).toBeUndefined()
    expect(client.calls.find((call) => call.table === 'rpc:admin_approve_learning_candidate_atomic')?.operations)
      .toContainEqual([
        'rpc',
        'admin_approve_learning_candidate_atomic',
        expect.objectContaining({
          p_candidate_id: 'candidate-1',
          p_admin_id: 'admin-1',
        }),
      ])
    expect(client.calls.find((call) =>
      call.table === 'rpc:apply_approved_learning_candidate_to_knowledge'
    )).toBeUndefined()
    expect(client.calls.find((call) => call.table === 'rpc:admin_reject_learning_candidate')?.operations)
      .toContainEqual([
        'rpc',
        'admin_reject_learning_candidate',
        expect.objectContaining({
          p_candidate_id: 'candidate-2',
          p_admin_id: 'admin-1',
          p_reason: 'insufficient_evidence',
        }),
      ])
  })

  it('A4 audits non-admin learning candidate review attempts before denying', async () => {
    const client = makeSequenceClient([{ data: null, error: null }])
    const services = createEdgeServices({})
    const ctx = makeCtx('customer', 'customer-1', client)

    await expect(services.approveKaelLearningCandidate(ctx, 'candidate-1', {
      review_note: 'not allowed',
    })).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
      status: 403,
    })

    expect(client.calls[0]).toMatchObject({ table: 'kael_permission_audit' })
    expect(client.calls[0].operations).toContainEqual([
      'insert',
      expect.objectContaining({
        actor_id: 'customer-1',
        actor_role: 'customer',
        purpose: 'kael_learning_admin_review',
        action: 'approve',
        decision: 'deny',
        reason_code: 'admin_required',
        safe_metadata: { candidate_id: 'candidate-1' },
      }),
    ])
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
    in(column: string, values: unknown[]) {
      call.operations.push(['in', column, values])
      return query
    },
    gte(column: string, value: unknown) {
      call.operations.push(['gte', column, value])
      return query
    },
    lte(column: string, value: unknown) {
      call.operations.push(['lte', column, value])
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
