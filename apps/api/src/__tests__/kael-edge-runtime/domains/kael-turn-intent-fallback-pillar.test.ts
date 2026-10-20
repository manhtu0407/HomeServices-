import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { memoryDb } from '../harness/memory-db'

export const PILLAR = {
  id: 'P393-kael-turn-intent-fallback',
  invariant:
    'a classifier that is unavailable, slow, malformed, unsure or denied is a marked uncertainty, never a confident provide_information: a standalone WHY question is explained from the case as it stands, a real pending-slot answer still reaches intake, and no failure path re-estimates, confirms, requests a worker quote or creates a Job',
  authority: [
    'governance/RULES.md #7 (raw model output and the client never cross a confirmation gate)',
    'governance/RULES.md #8 (fallback is allowed, fake success and silent degradation are not)',
    'governance/RULES.md #3 (a schema-invalid model result is never used)',
  ],
  target: 'supabase/functions/mobile-api/_shared/kael/tools/case-turn-intent.ts',
  layer: 'integration',
  siblings: ['P363-kael-turn-intent-router', 'P385-kael-turn-understanding', 'P386-kael-clarification-loop-breaker'],
  mutation:
    'make deterministicTurnIntent return provide_information for everything — every WHY case turns red; return ask_question for a pending-slot reply — the "2 máy treo tường 1HP" intake cases turn red; drop GATED_INTENTS from the router fail-closed guard — the fallback-sourced request_worker_quote case turns red',
} as const satisfies PillarManifest

const hooks = vi.hoisted(() => ({
  callAI: vi.fn(),
  answer: vi.fn(),
  gateDenied: false,
}))


vi.mock('../../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/provider-client.ts', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  callAI: (...args: unknown[]) => hooks.callAI(...args),
}))
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/permission-gate.ts', async (importOriginal) => {
  const actual = await importOriginal<{ evaluateKaelPermissionGate: (request: unknown) => unknown }>()
  return {
    ...actual,
    evaluateKaelPermissionGate: (request: unknown) =>
      hooks.gateDenied
        ? { allowed: false, decision: 'deny', reasonCode: 'DENY_TEST_POLICY', declineTemplateKey: 'cannot_do_action' }
        : actual.evaluateKaelPermissionGate(request),
  }
})
vi.mock('../../../../../../supabase/functions/mobile-api/_shared/domains/customer/assistant.ts', () => ({
  answerKaelAssistant: (...args: unknown[]) => hooks.answer(...args),
}))

import { buildInitialDiagnosisScopeArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael'
import { deterministicTurnIntent } from '../../../../../../supabase/functions/mobile-api/_shared/kael/tools/case-turn-intent'
import { KAEL_CIRCUIT_BREAKER } from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/circuit-breaker'
import { prepareKaelChatPrePipeline } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/branches-pre-pipeline'
import { diagnosisScopeWithQuestion } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-work-artifact'
import {
  resolveCaseTurnRouting,
  routeKaelChatTurnIntent,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/turn-intent-router'


const SESSION_ID = 'session-fallback'
const WHY = 'Tại sao chưa đủ dữ kiện?'
const FACT = '2 máy treo tường 1HP.'
const HVAC_QUESTION = 'Máy treo tường hay âm trần, mấy bộ, công suất khoảng bao nhiêu HP?'

const freshArtifact = () => buildInitialDiagnosisScopeArtifact({ serviceType: 'hvac', customerGoal: 'vệ sinh máy lạnh' })
const pendingSlotOf = () => freshArtifact().missing_facts[0]
const askingArtifact = () => diagnosisScopeWithQuestion(freshArtifact(), [pendingSlotOf()], HVAC_QUESTION, 0.3)

type SeedOptions = { pending?: boolean; status?: string; casePhase?: string; quoteTurn?: Record<string, unknown> }

function seed(options: SeedOptions = {}) {
  const original = {
    id: SESSION_ID,
    customer_id: 'customer-1',
    service_type: 'hvac',
    status: options.status ?? 'active',
    case_phase: options.casePhase ?? 'analysis',
    total_turns: 4,
    total_cost_usd: 0,
    job_id: null,
    diagnosis_scope: options.pending ? askingArtifact() : freshArtifact(),
    safe_metadata: {
      language: 'vi',
      address_district: 'Quận 1',
      ...(options.pending ? { slot_ask_counts: { [pendingSlotOf()]: 1 } } : {}),
    },
  }
  const db = memoryDb({
    kael_chat_sessions: [{ ...original, status: 'active', case_phase: 'analysis' }],
    kael_chat_turns: [
      { id: 'turn-3', session_id: SESSION_ID, turn_index: 3, role: 'kael', text_content: HVAC_QUESTION, safe_metadata: options.quoteTurn ?? {} },
    ],
    service_intake_policies: [],
    jobs: [],
  })
  return { db, original }
}

const baseInput = (db: ReturnType<typeof memoryDb>, original: Record<string, unknown>, message: string, chipIntent?: string) => ({
  ctx: { success: true, user: { id: 'customer-1' }, role: 'customer' } as never,
  client: db.client as never,
  sessionId: SESSION_ID,
  session: original,
  persistedMetadata: original.safe_metadata as Record<string, unknown>,
  message,
  language: 'vi' as const,
  chipIntent,
  secrets: {} as never,
})

const route = (db: ReturnType<typeof memoryDb>, original: Record<string, unknown>, message: string) =>
  routeKaelChatTurnIntent(baseInput(db, original, message))

const caseRecord = (db: ReturnType<typeof memoryDb>) => {
  const row = db.tables.kael_chat_sessions[0]
  return { diagnosis_scope: row.diagnosis_scope, service_type: row.service_type, job_id: row.job_id, status: row.status }
}
const kaelReplies = (db: ReturnType<typeof memoryDb>) =>
  db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael' && turn.id !== 'turn-3')
const lastIntent = (db: ReturnType<typeof memoryDb>) =>
  (db.tables.kael_chat_sessions[0].safe_metadata as Record<string, Record<string, unknown>>).last_turn_intent

const modelReply = (body: unknown) => async () => ({
  success: true as const,
  content: typeof body === 'string' ? body : JSON.stringify(body),
  latencyMs: 40,
  usage: { costUsd: 0.0002, inputTokens: 10, outputTokens: 10 },
  provider: 'deepseek' as const,
  model: 'deepseek-v4-flash',
})

type FaultMode = { name: string; reason: string; inject: () => void; modelCalls: number }
const FAULTS: FaultMode[] = [
  {
    name: 'provider route absent',
    reason: 'route_unavailable',
    modelCalls: 0,
    inject: () => KAEL_CIRCUIT_BREAKER.recordFailure({ purpose: 'case_turn_intent', provider: 'deepseek', errorCode: 'HTTP_402' }),
  },
  {
    name: 'provider times out',
    reason: 'provider_unavailable',
    modelCalls: 1,
    inject: () => hooks.callAI.mockResolvedValue({ success: false, provider: 'deepseek', code: 'TIMEOUT', error: 'timeout' }),
  },
  {
    name: 'provider call throws',
    reason: 'provider_unavailable',
    modelCalls: 1,
    inject: () => hooks.callAI.mockRejectedValue(new Error('socket hang up')),
  },
  {
    name: 'malformed JSON',
    reason: 'schema_invalid',
    modelCalls: 1,
    inject: () => hooks.callAI.mockImplementation(modelReply('not json {{ at all')),
  },
  {
    name: 'schema-invalid object',
    reason: 'schema_invalid',
    modelCalls: 1,
    inject: () => hooks.callAI.mockImplementation(modelReply({ intent: 'proceed_or_confirm', confidence: 0.99, price_vnd: 300000 })),
  },
  {
    name: 'low confidence',
    reason: 'low_confidence',
    modelCalls: 1,
    inject: () => hooks.callAI.mockImplementation(modelReply({ intent: 'provide_information', confidence: 0.3 })),
  },
  {
    name: 'permission gate denial',
    reason: 'policy_denied',
    modelCalls: 0,
    inject: () => {
      hooks.gateDenied = true
    },
  },
]

beforeEach(() => {
  hooks.callAI.mockReset()
  hooks.answer.mockReset()
  hooks.gateDenied = false
  KAEL_CIRCUIT_BREAKER.reset()
  hooks.answer.mockResolvedValue({ answer: 'Kael còn thiếu số bộ và công suất để báo giá.', safety_notes: [], fallback_used: false })
})

afterEach(() => {
  KAEL_CIRCUIT_BREAKER.reset()
  vi.unstubAllGlobals()
})

describe(`${PILLAR.id}: a standalone WHY question survives every classifier failure`, () => {
  for (const pending of [true, false]) {
    for (const fault of FAULTS) {
      it(`${fault.name}, ${pending ? 'with a pending slot' : 'with no pending slot'}: explained from the case, nothing re-estimated or confirmed`, async () => {
        const fetchSpy = vi.fn()
        vi.stubGlobal('fetch', fetchSpy)
        fault.inject()
        const { db, original } = seed({ pending })
        const before = structuredClone(caseRecord(db))

        const handled = await route(db, original, WHY)

        expect(handled, pillarWhy(PILLAR, `${fault.name}: the WHY must not fall through to the estimate pipeline`)).toBe(true)
        expect(hooks.callAI, pillarWhy(PILLAR, 'only the classifier may reach a model before the explanation')).toHaveBeenCalledTimes(fault.modelCalls)
        expect(fetchSpy, pillarWhy(PILLAR, 'no provider price call')).not.toHaveBeenCalled()
        expect(hooks.answer, pillarWhy(PILLAR, 'the case question handler produced the answer')).toHaveBeenCalledTimes(1)
        expect(lastIntent(db), pillarWhy(PILLAR, 'fallback provenance must be recorded, not hidden behind a confident intent')).toMatchObject({
          intent: 'ask_question',
          source: 'fallback',
          fallback_reason: fault.reason,
          fallback_basis: 'standalone_question',
        })
        const reply = kaelReplies(db)[0]
        expect(reply?.safe_metadata).toMatchObject({
          answered_turn_intent: 'ask_question',
          turn_intent_source: 'fallback',
          turn_intent_fallback_reason: fault.reason,
        })
        expect(caseRecord(db), pillarWhy(PILLAR, 'the Case record is exactly what the customer left')).toEqual(before)
        expect(db.tables.jobs, pillarWhy(PILLAR, 'a clarification never creates a Job')).toHaveLength(0)
      })
    }
  }

  it('records no fallback fields when the model is confident', async () => {
    hooks.callAI.mockImplementation(modelReply({ intent: 'ask_question', confidence: 0.92 }))
    const { db, original } = seed()
    expect(await route(db, original, WHY)).toBe(true)
    const intent = lastIntent(db)
    expect(intent).toMatchObject({ intent: 'ask_question', source: 'ai', confidence: 0.92, provider: 'deepseek' })
    expect(intent, pillarWhy(PILLAR, 'confident and fallback classification must stay distinguishable')).not.toHaveProperty('fallback_reason')
  })

  it('still answers safely when the explanation model is also down', async () => {
    hooks.callAI.mockResolvedValue({ success: false, provider: 'deepseek', code: 'TIMEOUT', error: 'timeout' })
    hooks.answer.mockRejectedValue(new Error('assistant unavailable'))
    const { db, original } = seed({ pending: true })
    const before = structuredClone(caseRecord(db))
    expect(await route(db, original, WHY)).toBe(true)
    expect(kaelReplies(db)[0]?.text_content, pillarWhy(PILLAR, 'an honest unavailable notice, not a refusal')).toContain('Yêu cầu của bạn vẫn giữ nguyên')
    expect(kaelReplies(db)[0]?.text_content).not.toMatch(/ngoài|không hỗ trợ|sáu/i)
    expect(caseRecord(db)).toEqual(before)
  })
})

describe(`${PILLAR.id}: real case information is never mistaken for a question`, () => {
  for (const fault of FAULTS) {
    it(`${fault.name}: "${FACT}" under the pending HVAC slot still reaches intake`, async () => {
      fault.inject()
      const { db, original } = seed({ pending: true })
      const resolved = await resolveCaseTurnRouting({ ...baseInput(db, original, FACT) })
      expect(resolved.routing, pillarWhy(PILLAR, `${fault.name}: a factual reply is information`)).toMatchObject({
        intent: 'provide_information',
        source: 'fallback',
      })

      const handled = await routeKaelChatTurnIntent({ ...baseInput(db, original, FACT), resolved })
      expect(handled, pillarWhy(PILLAR, 'intake must run')).toBe(false)
      expect(kaelReplies(db)).toHaveLength(0)

      const prepared = await prepareKaelChatPrePipeline({
        client: db.client as never,
        sessionId: SESSION_ID,
        actorId: 'customer-1',
        message: FACT,
        serviceType: 'hvac',
        safeCustomerEvidence: FACT,
        durableCustomerDetail: FACT,
        problemChips: [],
        language: 'vi',
        earlySafetySignals: [],
        progressTarget: { table: 'kael_chat_sessions', id: SESSION_ID },
        llmClarificationEnabled: true,
        address_district: 'q1',
        slotUnderstanding: resolved.routing.slotUnderstanding,
      } as never)
      expect(prepared.handled).toBe(false)
      const stored = db.tables.kael_chat_sessions[0].diagnosis_scope as { facts: Record<string, string>; missing_facts: string[] }
      expect(stored.facts[pendingSlotOf()], pillarWhy(PILLAR, 'the confirmed unit facts fill the asked slot')).toContain('2 máy treo tường 1HP')
      expect(stored.missing_facts).not.toContain(pendingSlotOf())
    })
  }

  it('lets a new HVAC description reach intake when no slot is pending and the model is down', async () => {
    KAEL_CIRCUIT_BREAKER.recordFailure({ purpose: 'case_turn_intent', provider: 'deepseek', errorCode: 'HTTP_402' })
    const { db, original } = seed()
    expect(await route(db, original, 'Máy lạnh phòng ngủ chảy nước, cần vệ sinh 2 máy')).toBe(false)
    expect(kaelReplies(db)).toHaveLength(0)
    expect(lastIntent(db)).toMatchObject({ intent: 'provide_information', source: 'fallback', fallback_reason: 'route_unavailable', fallback_basis: 'case_information' })
  })

  it('does not turn a bare question mark with a pending slot into a question', async () => {
    KAEL_CIRCUIT_BREAKER.recordFailure({ purpose: 'case_turn_intent', provider: 'deepseek', errorCode: 'HTTP_402' })
    const { db, original } = seed({ pending: true })
    expect(await route(db, original, 'Treo tường hả?'), pillarWhy(PILLAR, 'only an explicit WHY ask outranks a pending slot')).toBe(false)
  })
})

describe(`${PILLAR.id}: a fallback never crosses an approval gate`, () => {
  const fallbackRouting = (intent: string) => ({
    routing: { intent, source: 'fallback' as const, confidence: 0, fallbackReason: 'provider_unavailable' as const, fallbackBasis: 'case_information' as const },
    quoteTurn: null,
  })

  for (const intent of ['proceed_or_confirm', 'request_worker_quote'] as const) {
    it(`a fallback-sourced ${intent} asks for clarification and changes nothing`, async () => {
      const { db, original } = seed({ status: 'estimate_ready', casePhase: 'offer_review' })
      const before = structuredClone(caseRecord(db))
      const handled = await routeKaelChatTurnIntent({ ...baseInput(db, original, 'ok'), resolved: fallbackRouting(intent) as never })
      expect(handled).toBe(true)
      expect(caseRecord(db), pillarWhy(PILLAR, 'no status, scope or Job change')).toEqual({ ...before, status: 'estimate_ready' })
      expect(db.tables.jobs).toHaveLength(0)
      expect(kaelReplies(db)[0]?.safe_metadata).toMatchObject({ turn_intent_source: 'fallback' })
      expect(kaelReplies(db)[0]?.text_content, pillarWhy(PILLAR, 'the customer is told how to confirm')).toContain('xác nhận')
      expect((kaelReplies(db)[0]?.safe_metadata as Record<string, unknown>).worker_quote_unavailable_reason).toBeUndefined()
    })
  }

  it('answers a bare "go ahead" while the model is down with a clarification, not the estimate pipeline', async () => {
    KAEL_CIRCUIT_BREAKER.recordFailure({ purpose: 'case_turn_intent', provider: 'deepseek', errorCode: 'HTTP_402' })
    const { db, original } = seed({ status: 'estimate_ready', casePhase: 'offer_review' })
    expect(await route(db, original, 'Ok đặt luôn đi')).toBe(true)
    expect(lastIntent(db)).toMatchObject({ source: 'fallback', fallback_basis: 'ambiguous' })
    expect(kaelReplies(db)[0]?.text_content).toContain('xác nhận')
    expect(db.tables.kael_chat_sessions[0].status).toBe('estimate_ready')
    expect(db.tables.kael_chat_sessions[0].case_phase).toBe('offer_review')
    expect(db.tables.jobs).toHaveLength(0)
  })
})

describe(`${PILLAR.id}: confident classification keeps its own route`, () => {
  const GAP = { quote_readiness: 'validated_price_evidence_unavailable', reference_price: { price_min: 150_000, price_max: 300_000, unit: 'per_item', source_count: 2, sources: [] } }

  it('reference price answers from the recorded gap without a provider price call', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    hooks.callAI.mockImplementation(modelReply({ intent: 'request_reference_price', confidence: 0.95 }))
    const { db, original } = seed({ quoteTurn: GAP })
    expect(await route(db, original, 'Cứ đưa giá tham khảo để xem thử')).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(kaelReplies(db)[0]?.text_content).toContain('150.000–300.000 đ/món')
    expect(lastIntent(db)).toMatchObject({ source: 'ai' })
  })

  it('go-ahead still only points at the confirm button', async () => {
    hooks.callAI.mockImplementation(modelReply({ intent: 'proceed_or_confirm', confidence: 0.92 }))
    const { db, original } = seed({ status: 'estimate_ready', casePhase: 'offer_review' })
    expect(await route(db, original, 'Ok đặt luôn đi')).toBe(true)
    expect(kaelReplies(db)[0]?.text_content).toContain('bấm nút xác nhận')
    expect(db.tables.jobs).toHaveLength(0)
  })

  it('a worker-quote request on an offer under review is not executed', async () => {
    hooks.callAI.mockImplementation(modelReply({ intent: 'request_worker_quote', confidence: 0.9 }))
    const { db, original } = seed({ status: 'estimate_ready', casePhase: 'offer_review' })
    expect(await route(db, original, 'Gửi cho thợ báo giá giúp mình')).toBe(true)
    expect(kaelReplies(db)[0]?.text_content).toContain('xác nhận')
    expect(db.tables.kael_chat_sessions[0].status).toBe('estimate_ready')
  })

  it('a correction re-enters estimation', async () => {
    hooks.callAI.mockImplementation(modelReply({ intent: 'correction', confidence: 0.9 }))
    const { db, original } = seed()
    expect(await route(db, original, 'Nhầm rồi, là 3 máy chứ không phải 2')).toBe(false)
  })

  it('a complaint is answered, not re-estimated', async () => {
    hooks.callAI.mockImplementation(modelReply({ intent: 'request_human_or_complaint', confidence: 0.9 }))
    const { db, original } = seed()
    expect(await route(db, original, 'Tôi muốn gặp người hỗ trợ')).toBe(true)
    expect(hooks.answer).toHaveBeenCalledTimes(1)
  })

  it('a genuinely unsupported service is still stopped by the boundary guard after a fallback', async () => {
    KAEL_CIRCUIT_BREAKER.recordFailure({ purpose: 'case_turn_intent', provider: 'deepseek', errorCode: 'HTTP_402' })
    const { db, original } = seed()
    const message = 'Sửa giúp mình cái xe máy bị chết máy'
    expect(await route(db, original, message), pillarWhy(PILLAR, 'the fallback hands it to the pipeline, whose guard declines it')).toBe(false)
    const prepared = await prepareKaelChatPrePipeline({
      client: db.client as never,
      sessionId: SESSION_ID,
      actorId: 'customer-1',
      message,
      serviceType: 'hvac',
      safeCustomerEvidence: message,
      durableCustomerDetail: message,
      problemChips: [],
      language: 'vi',
      earlySafetySignals: [],
      progressTarget: { table: 'kael_chat_sessions', id: SESSION_ID },
      llmClarificationEnabled: true,
    } as never)
    expect(prepared.handled).toBe(true)
  })
})

describe(`${PILLAR.id}: the deterministic reading never names a gate`, () => {
  const cases: Array<[string, boolean, string, string]> = [
    ['Tại sao chưa đủ dữ kiện?', true, 'ask_question', 'standalone_question'],
    ['tai sao chua du du kien', false, 'ask_question', 'standalone_question'],
    ['Vì sao Kael cần biết công suất?', true, 'ask_question', 'standalone_question'],
    ['Why do you need the HP?', true, 'ask_question', 'standalone_question'],
    ['Nghĩa là sao?', true, 'ask_question', 'standalone_question'],
    ['Tại sao cần 2 máy?', true, 'ask_question', 'standalone_question'],
    ['Sao vậy?', false, 'ask_question', 'standalone_question'],
    ['Giá bao nhiêu?', false, 'ask_question', 'standalone_question'],
    ['2 máy treo tường 1HP.', true, 'provide_information', 'pending_slot_reply'],
    ['âm trần, 1 bộ, 2HP', true, 'provide_information', 'pending_slot_reply'],
    ['Treo tường hả?', true, 'provide_information', 'pending_slot_reply'],
    ['Máy lạnh phòng ngủ chảy nước, cần vệ sinh 2 máy', false, 'provide_information', 'case_information'],
    ['Tại sao tường nhà mình ẩm', false, 'ask_question', 'standalone_question'],
    ['Ok đặt luôn đi', false, 'ask_question', 'ambiguous'],
    ['đồng ý', false, 'ask_question', 'ambiguous'],
    ['go ahead', false, 'ask_question', 'ambiguous'],
    ['', false, 'ask_question', 'ambiguous'],
  ]
  for (const [message, hasPendingSlot, intent, basis] of cases) {
    it(`"${message}" with${hasPendingSlot ? '' : 'out'} a pending slot reads as ${intent} / ${basis}`, () => {
      expect(deterministicTurnIntent({ message, hasPendingSlot }), pillarWhy(PILLAR, message)).toEqual({ intent, basis })
    })
  }

  it('never returns an intent that confirms, quotes or sends', () => {
    const allowed = new Set(['ask_question', 'provide_information'])
    for (const [message, hasPendingSlot] of cases) {
      expect(allowed.has(deterministicTurnIntent({ message, hasPendingSlot }).intent), pillarWhy(PILLAR, message)).toBe(true)
    }
  })
})
