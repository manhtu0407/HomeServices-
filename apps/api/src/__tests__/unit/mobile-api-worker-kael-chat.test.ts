import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  guardWorkerAssistText,
  runWorkerAssist,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/worker-assist'
import { detectForbiddenAiDecisionText } from '../../../../../supabase/functions/mobile-api/_shared/kael/ai-boundary-contract'

const job = {
  id: 'job-1',
  status: 'worker_matched',
  service_type: 'plumbing',
  description: 'Sink leak under cabinet',
  address_district: 'binh_thanh',
  kael_problem_identified: 'Pipe leak under sink',
  kael_complexity: 'medium',
}

const DEFAULT_EXPECTED_EN_NOTES = [
  'Do not quote a new price outside the Kael flow in the app.',
  'Do not change lifecycle status without real evidence.',
]

describe('mobile-api worker Kael chat sibling backend', () => {
  it('returns bounded worker-assist JSON without price or lifecycle mutation', async () => {
    const answer = await runWorkerAssist({
      job,
      question: 'Toi can kiem tra pham vi nao truoc khi sua?',
      secrets: {},
      callAI: async () => ({
        success: true,
        content: JSON.stringify({
          text: 'Ki\u1ec3m tra \u0111\u00fang m\u00f4 t\u1ea3 vi\u1ec7c, ch\u1ee5p b\u1eb1ng ch\u1ee9ng, v\u00e0 t\u1ea1o y\u00eau c\u1ea7u thay \u0111\u1ed5i ph\u1ea1m vi n\u1ebfu c\u00f3 ph\u1ea7n ph\u00e1t sinh.',
          safety_notes: ['Trao \u0111\u1ed5i trong app v\u00e0 ghi b\u1eb1ng ch\u1ee9ng tr\u01b0\u1edbc khi ti\u1ebfp t\u1ee5c.'],
          redirect_scope_change: true,
        }),
        usage: { inputTokens: 100, outputTokens: 40, costUsd: 0.0001 },
        latencyMs: 120,
      }),
    })

    expect(answer).toMatchObject({
      schema_version: 'worker_assist_answer.v1',
      fallback_used: false,
      redirect_scope_change: true,
      provider: 'deepseek',
    })
    expect(answer.text).not.toMatch(/vnd|dong|status|trang thai/i)
  })

  it('falls back when the model tries to set price or status', async () => {
    const answer = await runWorkerAssist({
      job,
      question: 'Co phat sinh thi chot gia va hoan tat luon duoc khong?',
      secrets: {},
      callAI: async () => ({
        success: true,
        content: JSON.stringify({
          text: 'Chot gia 500000 VND va cap nhat trang thai hoan tat.',
          safety_notes: [],
          redirect_scope_change: false,
        }),
        usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.0001 },
        latencyMs: 80,
      }),
    })

    expect(answer.fallback_used).toBe(true)
    expect(answer.redirect_scope_change).toBe(true)
    expect(answer.guardrail_reason).toBe('MONEY_OR_STATUS_MUTATION')
  })

  it('accepts provider JSON with harmless metadata keys', async () => {
    const answer = await runWorkerAssist({
      job,
      question: 'What should I inspect first at the leak?',
      language: 'en',
      secrets: {},
      callAI: async () => ({
        success: true,
        content: JSON.stringify({
          schema_version: 'worker_assist_answer.v1',
          text: 'Inspect the shutoff valve, visible pipe joints, and wet cabinet surfaces before moving any part.',
          safety_notes: ['Keep the work inside the accepted job and document what you find.'],
          redirect_scope_change: false,
        }),
        usage: { inputTokens: 90, outputTokens: 35, costUsd: 0.00008 },
        latencyMs: 96,
      }),
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      provider: 'deepseek',
      model: expect.any(String),
      cost_usd: 0.00008,
    })
  })

  it('normalizes provider JSON that uses answer aliases instead of the strict text key', async () => {
    const answer = await runWorkerAssist({
      job,
      question: 'What should I inspect first at the leak?',
      language: 'en',
      secrets: {},
      callAI: async () => ({
        success: true,
        content: JSON.stringify({
          answer: 'Inspect the shutoff valve and visible pipe joints before moving any part.',
          safety_note: 'Keep the work inside the accepted job and document what you find.',
          scope_change_required: false,
        }),
        usage: { inputTokens: 82, outputTokens: 28, costUsd: 0.00006 },
        latencyMs: 88,
      }),
    })

    expect(answer).toMatchObject({
      fallback_used: false,
      provider: 'deepseek',
      cost_usd: 0.00006,
    })
    expect(answer.text).toContain('shutoff valve')
    expect(answer.safety_notes).toContain('Keep the work inside the accepted job and document what you find.')
  })

  it('normalizes oversized or mixed-type provider safety notes before validation', async () => {
    const answer = await runWorkerAssist({
      job,
      question: 'What should I inspect first at the leak?',
      language: 'en',
      secrets: {},
      callAI: async () => ({
        success: true,
        content: JSON.stringify({
          text: 'Inspect the shutoff valve and visible pipe joints before moving any part.',
          safety_notes: [
            'Document visible water before changing anything.',
            { text: 'Keep communication inside the app.' },
            '',
            'Save evidence before continuing.',
            'This fourth note should be trimmed.',
          ],
          redirect_scope_change: false,
        }),
        usage: { inputTokens: 84, outputTokens: 30, costUsd: 0.00007 },
        latencyMs: 91,
      }),
    })

    expect(answer.fallback_used).toBe(false)
    expect(answer.safety_notes).toHaveLength(3)
    expect(answer.safety_notes).toContain('Keep communication inside the app.')
  })

  it('defaults malformed provider notes and string redirect flags to safe values', async () => {
    const answer = await runWorkerAssist({
      job,
      question: 'What should I inspect first at the leak?',
      language: 'en',
      secrets: {},
      callAI: async () => ({
        success: true,
        content: JSON.stringify({
          text: 'Inspect the shutoff valve and visible pipe joints before moving any part.',
          safety_notes: [{ label: 'not a supported note shape' }],
          redirect_scope_change: 'no',
        }),
        usage: { inputTokens: 84, outputTokens: 30, costUsd: 0.00007 },
        latencyMs: 91,
      }),
    })

    expect(answer.fallback_used).toBe(false)
    expect(answer.redirect_scope_change).toBe(false)
    expect(answer.safety_notes).toEqual(expect.arrayContaining(DEFAULT_EXPECTED_EN_NOTES))
  })

  it('tries the fallback provider when the primary worker-assist call times out', async () => {
    const attemptedProviders: string[] = []
    const attemptedTimeouts: Array<number | undefined> = []

    const answer = await runWorkerAssist({
      job,
      question: 'What should I inspect first at the lavabo leak before touching any parts?',
      language: 'en',
      secrets: {},
      callAI: async (request) => {
        attemptedProviders.push(request.provider)
        attemptedTimeouts.push(request.timeoutMs)
        if (request.provider === 'deepseek') {
          return {
            success: false,
            provider: request.provider,
            code: 'TIMEOUT',
            error: 'TIMEOUT',
          }
        }
        return {
          success: true,
          content: JSON.stringify({
            text: 'Inspect the shutoff valve, visible pipe joints, and wet cabinet surfaces before moving any part.',
            safety_notes: ['Keep the work inside the accepted job and document what you find.'],
            redirect_scope_change: false,
          }),
          usage: { inputTokens: 120, outputTokens: 45, costUsd: 0.00042 },
          latencyMs: 620,
        }
      },
    })

    expect(attemptedProviders).toEqual(['deepseek', 'anthropic'])
    expect(Math.min(...attemptedTimeouts.map((value) => value ?? 0))).toBeGreaterThanOrEqual(4000)
    expect(answer).toMatchObject({
      fallback_used: false,
      provider: 'anthropic',
      model: expect.any(String),
      cost_usd: 0.00042,
      provider_attempts: [
        expect.objectContaining({ provider: 'deepseek', role: 'primary', result: 'error', code: 'TIMEOUT' }),
        expect.objectContaining({ provider: 'anthropic', role: 'fallback', result: 'success' }),
      ],
    })
  })

  it('guards text that attempts a money or lifecycle mutation', () => {
    expect(guardWorkerAssistText('Chot gia 300k va cap nhat status hoan tat')).toMatchObject({
      allowed: false,
      reason: 'MONEY_OR_STATUS_MUTATION',
    })
  })

  it('guards scope, dispute, and penalty decisions as deterministic-only surfaces', () => {
    expect(detectForbiddenAiDecisionText('Approve scope phat sinh nay va hoan tien 100k cho khach')).toMatchObject({
      allowed: false,
      violations: expect.arrayContaining([
        expect.objectContaining({ surface: 'scope_change_decision' }),
        expect.objectContaining({ surface: 'penalty_or_compensation' }),
      ]),
    })
    expect(guardWorkerAssistText('Dispute nay worker wins, customer must refund.')).toMatchObject({
      allowed: false,
      reason: 'MONEY_OR_STATUS_MUTATION',
    })
  })

  it('wires worker-owned chat routes and DB tables separately from customer Kael chat', () => {
    const router = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/router.ts', import.meta.url),
      'utf8',
    )
    const services = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/services.ts', import.meta.url),
      'utf8',
    )
    const migration = readFileSync(
      new URL('../../../../../supabase/migrations/20260604224500_kael_worker_chat_sessions.sql', import.meta.url),
      'utf8',
    )

    expect(router).toContain('/workers/me/kael/chat')
    expect(router).toContain('/workers/me/kael-feedback')
    expect(router).toContain('/workers/me/kael-training-consent')
    expect(router).toContain('workers.kaelChat.create')
    expect(router).toContain('workers.kaelChat.stream')
    expect(router).toContain('workerKaelChatCreateSchema.safeParse')
    expect(router).toContain('workerKaelFeedbackSchema.safeParse')
    expect(router).toContain('workerKaelTrainingConsentSchema.safeParse')
    expect(services).toContain('requireWorkerKaelChatJob')
    expect(services).toContain('streamWorkerKaelChatTurn')
    expect(services).toContain('runWorkerAssist')
    expect(services).toContain('submitWorkerKaelFeedback')
    expect(services).toContain('setWorkerKaelTrainingConsent')
    expect(services).toContain('isWorkerAssistGuardrailReason')
    expect(services).toContain('.eq("job_id", jobId)')
    expect(services).toContain('ai_model: answer.model ?? null')
    expect(migration).toContain('create table if not exists public.kael_worker_chat_sessions')
    expect(migration).toContain('create table if not exists public.kael_worker_chat_turns')
    expect(migration).toContain('check_kael_worker_chat_rate')
  })

  it('scopes worker Kael chat idempotency to the active job', () => {
    const migration = readFileSync(
      new URL('../../../../../supabase/migrations/20260605005000_scope_worker_kael_chat_idempotency_by_job.sql', import.meta.url),
      'utf8',
    )

    expect(migration).toContain('drop index if exists public.kael_worker_chat_sessions_worker_idempotency_idx')
    expect(migration).toContain('alter table public.kael_worker_chat_turns')
    expect(migration).toContain('add column if not exists job_id uuid references public.jobs on delete cascade')
    expect(migration).toContain('alter column job_id set not null')
    expect(migration).toContain('(worker_id, job_id, client_request_id)')
    expect(migration).toContain('where client_request_id is not null')
  })

  it('ships worker feedback and training-consent storage behind service-role writes', () => {
    const migration = readFileSync(
      new URL('../../../../../supabase/migrations/20260604225500_worker_kael_feedback_consent.sql', import.meta.url),
      'utf8',
    )

    expect(migration).toContain('create table if not exists public.worker_kael_feedback')
    expect(migration).toContain('create table if not exists public.worker_kael_training_consent')
    expect(migration).toContain('grant all on public.worker_kael_feedback to service_role')
    expect(migration).toContain('grant all on public.worker_kael_training_consent to service_role')
    expect(migration).toContain('grant select on public.worker_kael_feedback to authenticated')
  })
})
