import { afterEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { memoryDb } from '../harness/memory-db'

export const PILLAR = {
  id: 'P363-kael-turn-intent-router',
  invariant:
    'a plain Work turn is classified before price research runs again: new information still reaches the pipeline, while questions, reference-price requests and "go ahead" are answered from the case as it stands, without a provider price call, without confirming anything, and without losing an offer under review',
  authority: [
    'governance/RULES.md #7 (raw model output and the client never change workflow state; no gate is crossed)',
    'governance/RULES.md #8 (no fabricated price; a known gap is reported, not re-searched)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/turn-intent-router.ts',
  layer: 'unit',
  siblings: ['P362-kael-price-gap-reuse', 'P364-kael-evidence-gap-options', 'P365-kael-rfq-fallback-edge'],
  mutation:
    'make routeKaelChatTurnIntent always return false — the question case falls through to the pipeline and turns red; drop restoreReviewPhase — the offer-review case turns red; call the classifier for chip intents — the chip case turns red',
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

const SESSION_ID = 'session-router'

function seed(options: { status?: string; casePhase?: string; quoteTurn?: Record<string, unknown> } = {}) {
  const original = {
    id: SESSION_ID,
    customer_id: 'customer-1',
    service_type: 'handyman',
    status: options.status ?? 'active',
    case_phase: options.casePhase ?? 'analysis',
    total_turns: 9,
    total_cost_usd: 0,
    job_id: null,
    diagnosis_scope: null,
    safe_metadata: { language: 'vi', address_district: 'Quận 1' },
  }
  const db = memoryDb({
    // The incoming turn has already parked the stored row in analysis, as turn.ts does.
    kael_chat_sessions: [{ ...original, status: 'active', case_phase: 'analysis' }],
    kael_chat_turns: options.quoteTurn
      ? [{ id: 'turn-7', session_id: SESSION_ID, turn_index: 7, role: 'kael', text_content: 'Kael chưa thể đưa ra giá.', safe_metadata: options.quoteTurn }]
      : [],
    service_intake_policies: [],
  })
  return { db, original }
}

function route(db: ReturnType<typeof memoryDb>, original: Record<string, unknown>, message: string, chipIntent?: string) {
  return routeKaelChatTurnIntent({
    ctx: { success: true, user: { id: 'customer-1' }, role: 'customer' } as never,
    client: db.client as never,
    sessionId: SESSION_ID,
    session: original,
    persistedMetadata: original.safe_metadata as Record<string, unknown>,
    message,
    language: 'vi',
    chipIntent,
    secrets: {} as never,
  })
}

const kaelReplies = (db: ReturnType<typeof memoryDb>) =>
  db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael' && turn.id !== 'turn-7')

afterEach(() => {
  hooks.classify.mockReset()
  hooks.answer.mockReset()
  vi.unstubAllGlobals()
})

describe(`${PILLAR.id}: Kael answers what was asked`, () => {
  it('lets new case information reach the estimate pipeline', async () => {
    hooks.classify.mockResolvedValue({ intent: 'provide_information', confidence: 0.9, fallbackUsed: false })
    const { db, original } = seed()
    const handled = await route(db, original, 'Kệ gỗ 30x20, nặng 1kg')
    expect(handled, pillarWhy(PILLAR, 'case details must still be analysed')).toBe(false)
    expect(kaelReplies(db)).toHaveLength(0)
  })

  it('answers a chip question without classifying it and keeps the case unchanged', async () => {
    hooks.answer.mockResolvedValue({ answer: 'Kael cần thêm nguồn giá đã kiểm chứng.', safety_notes: [], fallback_used: false })
    const { db, original } = seed({ quoteTurn: { quote_readiness: 'validated_price_evidence_unavailable' } })
    const handled = await route(db, original, 'Vì sao chưa có giá?', 'ask_question')
    expect(handled).toBe(true)
    expect(hooks.classify, pillarWhy(PILLAR, 'a chip states its intent explicitly')).not.toHaveBeenCalled()
    const reply = kaelReplies(db)[0]
    expect(reply?.text_content).toContain('Kael cần thêm nguồn giá đã kiểm chứng.')
    expect(reply?.safe_metadata).toMatchObject({ answered_turn_intent: 'ask_question', turn_intent_source: 'chip' })
    expect((reply?.safe_metadata as { next_actions: unknown[] }).next_actions.length, pillarWhy(PILLAR, 'every answer offers a next step')).toBeGreaterThan(0)
    expect(db.tables.kael_chat_sessions[0].status).toBe('active')
  })

  it('answers a reference-price request from the recorded gap without any provider price call', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    hooks.classify.mockResolvedValue({ intent: 'request_reference_price', confidence: 0.95, fallbackUsed: false })
    const { db, original } = seed({
      quoteTurn: {
        quote_readiness: 'validated_price_evidence_unavailable',
        reference_price: { price_min: 150_000, price_max: 300_000, unit: 'per_item', source_count: 2, sources: [] },
      },
    })
    const handled = await route(db, original, 'Cứ đưa giá tham khảo để xem thử')
    expect(handled, pillarWhy(PILLAR, 'the Production session re-ran research on exactly this message')).toBe(true)
    expect(fetchSpy, pillarWhy(PILLAR, 'no provider is reached for a known gap')).not.toHaveBeenCalled()
    const reply = kaelReplies(db)[0]
    expect(reply?.text_content).toContain('150.000–300.000 đ/món')
    expect(reply?.text_content).toContain('Đây không phải báo giá')
    expect(reply?.safe_metadata).toMatchObject({ answered_turn_intent: 'request_reference_price', turn_intent_source: 'ai' })
    expect(db.tables.kael_chat_sessions[0].safe_metadata).toMatchObject({ last_turn_intent: { intent: 'request_reference_price', source: 'ai' } })
  })

  it('returns an offer under review to review after answering a question', async () => {
    hooks.classify.mockResolvedValue({ intent: 'ask_question', confidence: 0.9, fallbackUsed: false })
    hooks.answer.mockResolvedValue({ answer: 'Giá đã gồm công lắp.', safety_notes: [], fallback_used: false })
    const { db, original } = seed({ status: 'estimate_ready', casePhase: 'offer_review' })
    await route(db, original, 'Giá này đã gồm công lắp chưa?')
    expect(db.tables.kael_chat_sessions[0].status, pillarWhy(PILLAR, 'a question must not discard the offer')).toBe('estimate_ready')
    expect(db.tables.kael_chat_sessions[0].case_phase).toBe('offer_review')
  })

  it('never confirms when the customer says go ahead', async () => {
    hooks.classify.mockResolvedValue({ intent: 'proceed_or_confirm', confidence: 0.92, fallbackUsed: false })
    const { db, original } = seed({ status: 'estimate_ready', casePhase: 'offer_review' })
    const handled = await route(db, original, 'Ok đặt luôn đi')
    expect(handled).toBe(true)
    expect(kaelReplies(db)[0]?.text_content, pillarWhy(PILLAR, 'the confirmation gate stays with the customer')).toContain('bấm nút xác nhận')
    expect(db.tables.kael_chat_sessions[0].status).toBe('estimate_ready')
    expect(db.tables.jobs ?? []).toHaveLength(0)
  })

  it('keeps today’s behaviour when the classifier is unavailable', async () => {
    hooks.classify.mockResolvedValue({ intent: 'provide_information', confidence: 0, fallbackUsed: true })
    const { db, original } = seed({ quoteTurn: { quote_readiness: 'validated_price_evidence_unavailable' } })
    expect(await route(db, original, 'Sao vậy?')).toBe(false)
    expect(db.tables.kael_chat_sessions[0].safe_metadata).toMatchObject({ last_turn_intent: { source: 'fallback' } })
  })
})
