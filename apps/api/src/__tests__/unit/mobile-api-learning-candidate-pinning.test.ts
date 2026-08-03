import { afterEach, describe, expect, it, vi } from 'vitest'
import { processLearningCandidateResponse } from '../../../../../supabase/functions/mobile-api/_shared/kael/learning/cron/process-batch-results'
import {
  createLearningSkillCandidate,
  type LearningSkillInput,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/learning/skills/registry'
import type { QueuedLearningRow } from '../../../../../supabase/functions/mobile-api/_shared/kael/learning/cron/process-learning-queue'

function stubDenoEnv(env: Record<string, string>) {
  vi.stubGlobal('Deno', { env: { get: (key: string) => env[key] } })
}

const LEARNING_ON = {
  KAEL_LEARNING_READ_ENABLED: 'true',
  KAEL_LEARNING_WRITE_ENABLED: 'true',
  KAEL_LEARNING_KILL_SWITCH: 'false',
  KAEL_LEARNING_AB_PERCENTAGE: '100',
}

function learningInput(): LearningSkillInput {
  return {
    actor_id: '11111111-1111-4111-8111-111111111111',
    actor_role: 'customer',
    job_id: '22222222-2222-4222-8222-222222222222',
    customer_id: '11111111-1111-4111-8111-111111111111',
    service_type: 'electrical',
    problem_slug: 'outlet_dead',
    district_code: 'q1',
    complexity: 'small',
    baseline_min: 200_000,
    baseline_max: 400_000,
    final_price: 350_000,
    rating: 5,
    review_tags: [],
    scope_change_requested: false,
    reviewed_at: '2026-07-19T00:00:00.000Z',
  }
}

function ls4QueueRow(): QueuedLearningRow {
  const input = learningInput()
  return {
    id: '11111111-1111-4111-8111-111111111111',
    event_type: 'post-A14',
    skill_id: 'LS4',
    job_id: '22222222-2222-4222-8222-222222222222',
    actor_id: '11111111-1111-4111-8111-111111111111',
    actor_role: 'customer',
    queue_state: 'processing',
    input_payload: input,
    candidate_payload: createLearningSkillCandidate('LS4', input),
    attempts: 0,
    created_at: '2026-07-19T00:00:00.000Z',
  }
}

function throwingClient() {
  return {
    from: vi.fn(() => {
      throw new Error('db must not be touched before pin check')
    }),
  }
}

describe('LLM candidate pinning (cross-skill escalation)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects a response that renames candidate_type on an LS4 row', async () => {
    stubDenoEnv(LEARNING_ON)
    const queue = ls4QueueRow()
    const escalated = {
      ...queue.candidate_payload,
      candidate_type: 'analysis_rule',
      payload: {
        scope: { service_type: 'electrical', problem_slug: 'outlet_dead', district_code: 'q1' },
        suggested: { kind: 'raise_complexity_prior', from: 'small', to: 'large' },
        evidence_snapshot: {
          evidence_count: 8,
          confidence: 0.9,
          completed_transaction_count: 8,
          recent_contradiction_ratio: 0,
        },
      },
    }
    const outcome = await processLearningCandidateResponse(
      throwingClient() as never,
      queue,
      { candidate: escalated },
      new Date('2026-07-20T00:00:00.000Z'),
    )
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error_code).toBe('LEARNING_CANDIDATE_MISMATCH')
  })

  it('rejects a response that retargets an LS4 row', async () => {
    stubDenoEnv(LEARNING_ON)
    const queue = ls4QueueRow()
    const retargeted = {
      ...queue.candidate_payload,
      target: 'detection_pattern',
    }
    const outcome = await processLearningCandidateResponse(
      throwingClient() as never,
      queue,
      { candidate: retargeted },
      new Date('2026-07-20T00:00:00.000Z'),
    )
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error_code).toBe('LEARNING_CANDIDATE_MISMATCH')
  })

  it('rejects a response that moves scope to another district', async () => {
    stubDenoEnv(LEARNING_ON)
    const queue = ls4QueueRow()
    const queuedPayload = queue.candidate_payload.payload as Record<string, unknown>
    const moved = {
      ...queue.candidate_payload,
      payload: {
        ...queuedPayload,
        service_type: 'electrical',
        problem_slug: 'outlet_dead',
        district_code: 'q7',
      },
    }
    const outcome = await processLearningCandidateResponse(
      throwingClient() as never,
      queue,
      { candidate: moved },
      new Date('2026-07-20T00:00:00.000Z'),
    )
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error_code).toBe('LEARNING_CANDIDATE_MISMATCH')
  })

  it('accepts an unchanged candidate (no false positive from the pin)', async () => {
    stubDenoEnv(LEARNING_ON)
    const queue = ls4QueueRow()
    const outcome = await processLearningCandidateResponse(
      throwingClient() as never,
      queue,
      { candidate: queue.candidate_payload },
      new Date('2026-07-20T00:00:00.000Z'),
    )
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.queue_state).not.toBe('failed')
  })
})
