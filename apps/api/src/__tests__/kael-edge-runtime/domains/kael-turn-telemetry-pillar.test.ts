import { afterEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { memoryDb } from '../harness/memory-db'

export const PILLAR = {
  id: 'P382-kael-turn-telemetry',
  invariant:
    'every Kael turn records how its text was produced: the reply source (ai, template, fallback), and for an AI reply the provider, model and latency in the turn columns, so replies can be compared across paths without reading chat text',
  authority: [
    'governance/RULES.md #8 (a fallback is marked, never passed off as a model answer)',
    'governance/RULES.md #9 (telemetry carries ids and numbers only, never message text)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/session-store.ts',
  layer: 'unit',
  siblings: ['P363-kael-turn-intent-router'],
  mutation:
    'drop replySource from appendKaelSystemTurn — the reply_source assertions turn red; stop writing ai_provider/ai_model/latency_ms — the AI-reply columns assertion turns red; swap the fallback_used mapping in answerKaelCaseQuestion — the fallback case turns red',
} as const satisfies PillarManifest

const hooks = vi.hoisted(() => ({
  classify: vi.fn(),
  answer: vi.fn(),
}))

vi.mock('../../../../../../supabase/functions/mobile-api/_shared/kael/tools/case-turn-intent.ts', () => ({
  classifyCaseTurnIntent: (...args: unknown[]) => hooks.classify(...args),
}))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/customer/assistant.ts', () => ({
  answerKaelAssistant: (...args: unknown[]) => hooks.answer(...args),
}))

import { routeKaelChatTurnIntent } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/turn-intent-router'
import { appendKaelSystemTurn } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/session-store'
import { canonicalReplyComposer } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/reply-composer'
import {
  replyTelemetryMetadata,
  telemetryFromStageLogs,
  telemetryFromTrace,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/turn-telemetry'

const SESSION_ID = 'session-telemetry'

function seed(status = 'active', casePhase = 'analysis') {
  const original = {
    id: SESSION_ID,
    customer_id: 'customer-1',
    service_type: 'handyman',
    status,
    case_phase: casePhase,
    total_turns: 2,
    total_cost_usd: 0,
    job_id: null,
    diagnosis_scope: null,
    safe_metadata: { language: 'vi', address_district: 'Quận 1' },
  }
  const db = memoryDb({
    kael_chat_sessions: [{ ...original }],
    kael_chat_turns: [],
    service_intake_policies: [],
  })
  return { db, original }
}

function route(db: ReturnType<typeof memoryDb>, original: Record<string, unknown>, message: string) {
  return routeKaelChatTurnIntent({
    ctx: { success: true, user: { id: 'customer-1' }, role: 'customer' } as never,
    client: db.client as never,
    sessionId: SESSION_ID,
    session: original,
    persistedMetadata: original.safe_metadata as Record<string, unknown>,
    message,
    language: 'vi',
    secrets: {} as never,
    composeReply: canonicalReplyComposer,
  })
}

const trace = (provider: 'deepseek' | 'anthropic', model: string, latency: number, cost: number) => ({
  provider,
  model,
  latency_ms: latency,
  cost_usd: cost,
})

afterEach(() => {
  hooks.classify.mockReset()
  hooks.answer.mockReset()
})

describe(`${PILLAR.id}: a turn says how it was produced`, () => {
  it('marks a routed template reply and records the classifier call on the session', async () => {
    hooks.classify.mockResolvedValue({
      intent: 'proceed_or_confirm',
      confidence: 0.92,
      fallbackUsed: false,
      telemetry: { provider: 'deepseek', model: 'deepseek-v4-flash', latencyMs: 812.4, costUsd: 0.0004 },
    })
    const { db, original } = seed('estimate_ready', 'offer_review')
    await route(db, original, 'Ok đặt luôn đi')
    const reply = db.tables.kael_chat_turns.find((turn) => turn.role === 'kael')
    expect(reply?.safe_metadata, pillarWhy(PILLAR, 'a canned reply must be countable as a template')).toMatchObject({ reply_source: 'template' })
    expect(reply?.ai_provider).toBeNull()
    expect(db.tables.kael_chat_sessions[0].safe_metadata).toMatchObject({
      last_turn_intent: { provider: 'deepseek', model: 'deepseek-v4-flash', latency_ms: 812, cost_usd: 0.0004 },
    })
  })

  it('stores provider, model and latency for an AI answer', async () => {
    hooks.classify.mockResolvedValue({ intent: 'ask_question', confidence: 0.9, fallbackUsed: false })
    hooks.answer.mockResolvedValue({
      answer: 'Kael cần thêm nguồn giá đã kiểm chứng.',
      safety_notes: [],
      fallback_used: false,
      trace: [trace('deepseek', 'deepseek-v4-pro', 2410.6, 0.0031)],
    })
    const { db, original } = seed()
    await route(db, original, 'Vì sao chưa có giá?')
    const reply = db.tables.kael_chat_turns.find((turn) => turn.role === 'kael')
    expect(reply?.safe_metadata).toMatchObject({ reply_source: 'ai' })
    expect(reply, pillarWhy(PILLAR, 'production rows had these columns empty')).toMatchObject({
      ai_provider: 'deepseek',
      ai_model: 'deepseek-v4-pro',
      latency_ms: 2411,
      cost_usd: 0.0031,
    })
  })

  it('marks a guard fallback as a fallback, not as a model answer', async () => {
    hooks.classify.mockResolvedValue({ intent: 'ask_question', confidence: 0.9, fallbackUsed: false })
    hooks.answer.mockResolvedValue({
      answer: 'Mình chưa xử lý trọn câu hỏi này.',
      safety_notes: [],
      fallback_used: true,
      trace: [trace('deepseek', 'deepseek-v4-pro', 1800, 0.002)],
    })
    const { db, original } = seed()
    await route(db, original, 'Vì sao chưa có giá?')
    const reply = db.tables.kael_chat_turns.find((turn) => turn.role === 'kael')
    expect(reply?.safe_metadata, pillarWhy(PILLAR, 'fallbacks are never reported as AI')).toMatchObject({ reply_source: 'fallback', fallback_used: true })
  })

  it('adds the composer cost to the pipeline cost, in the row and in the session total', async () => {
    const { db } = seed()
    await appendKaelSystemTurn(db.client as never, SESSION_ID, {
      contentType: 'clarification',
      text: 'Câu hỏi',
      nextStatus: 'active',
      costUsd: 0.01,
      telemetry: { replySource: 'ai', provider: 'deepseek', model: 'm', latencyMs: 5, costUsd: 0.002 },
    })
    expect(db.tables.kael_chat_turns[0].cost_usd, pillarWhy(PILLAR, 'both calls were paid for')).toBeCloseTo(0.012, 6)
    expect(db.tables.kael_chat_sessions[0].total_cost_usd).toBeCloseTo(0.012, 6)
  })

  it('builds normal-chat telemetry from the trace without any text', () => {
    const metadata = replyTelemetryMetadata([trace('anthropic', 'claude-sonnet-5', 3200.2, 0.012)], false)
    expect(metadata).toEqual({
      reply_source: 'ai',
      fallback_used: false,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      latency_ms: 3200,
      cost_usd: 0.012,
    })
    expect(replyTelemetryMetadata(undefined, true)).toEqual({ reply_source: 'fallback', fallback_used: true })
    expect(replyTelemetryMetadata(undefined, false), pillarWhy(PILLAR, 'no provider call and no fallback is a deterministic reply')).toEqual({
      reply_source: 'template',
      fallback_used: false,
    })
  })

  it('reads the last provider call of a trace and of the pipeline stage logs', () => {
    expect(telemetryFromTrace([trace('deepseek', 'a', 1, 0), trace('anthropic', 'b', 2, 0)], 'ai')).toMatchObject({ provider: 'anthropic', model: 'b' })
    expect(telemetryFromTrace([], 'template')).toEqual({ replySource: 'template' })
    expect(
      telemetryFromStageLogs(
        [
          { stage: 'vision', provider: 'anthropic', model: 'v', latencyMs: 9, success: true, fallbackUsed: false },
          { stage: 'intent', provider: 'deepseek', model: 'i', latencyMs: 4000, success: true, fallbackUsed: false, costUsd: 0.001 },
        ],
        'intent',
        'ai',
      ),
    ).toMatchObject({ provider: 'deepseek', model: 'i', latencyMs: 4000, costUsd: 0.001, replySource: 'ai' })
  })
})
