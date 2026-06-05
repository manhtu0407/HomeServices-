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
    expect(migration).toContain('create table if not exists public.kael_worker_chat_sessions')
    expect(migration).toContain('create table if not exists public.kael_worker_chat_turns')
    expect(migration).toContain('check_kael_worker_chat_rate')
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
