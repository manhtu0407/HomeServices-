import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { memoryDb } from '../harness/memory-db'

export const PILLAR = {
  id: 'P392-kael-case-context',
  invariant:
    'an in-Case question is answered with the persisted Case as the only identity authority: the assistant, its topic and its permission decision see the session service as typed state on every turn (long history, reopened app), never an inference from the last few turns, and a Case that does not belong to the actor or whose state is corrupt is refused instead of being declared an unsupported service',
  authority: [
    'governance/RULES.md #6 (six supported services; HVAC is never narrowed or dropped mid-Case)',
    'governance/RULES.md #7 (raw LLM output and client input never set workflow state; no job or payment from a clarification)',
    'governance/RULES.md #8 (a missing context is a safe error, not an invented refusal)',
    'governance/RULES.md #9 and Security Invariants (minimum job context, scrubbed before any LLM)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/case-question.service.ts',
  layer: 'integration',
  siblings: ['P311-customer-normal-chat-topic-gate', 'P382-kael-turn-telemetry', 'P363-kael-turn-intent-router'],
  mutation:
    'stop passing the Case service to the assistant, or read it from the last turns instead of the session row — the HVAC identity assertions turn red; skip the owner check — the wrong-owner case turns red',
} as const satisfies PillarManifest

const hooks = vi.hoisted(() => ({ requests: [] as Array<Record<string, unknown>> }))

vi.mock('../../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/provider-client.ts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    callAI: async (request: Record<string, unknown>) => {
      hooks.requests.push(request)
      return {
        success: true as const,
        content: JSON.stringify({
          answer: 'Kael cần biết số máy, loại máy và công suất để rà soát đúng yêu cầu của bạn.',
          public_reasoning_summary: ['Dựa trên yêu cầu đang mở của bạn.'],
          service_intent: null,
        }),
        latencyMs: 12,
        usage: { costUsd: 0, inputTokens: 10, outputTokens: 10 },
      }
    },
  }
})

import { answerKaelAssistant } from '../../../../../../supabase/functions/mobile-api/_shared/domains/customer/assistant'
import { runCustomerAssistant } from '../../../../../../supabase/functions/mobile-api/_shared/kael/agents/customer-assistant'
import { EVIDENCE_GAP_QUOTE_READINESS } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/evidence-gap-policy'
import { buildCaseAssistantContext } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-context'
import { answerKaelCaseQuestion } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-question.service'
import {
  diagnosisScopeWithGroundedAnswer,
  diagnosisScopeWithQuestion,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-work-artifact'
import { buildInitialDiagnosisScopeArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael/index'
import { KAEL_CIRCUIT_BREAKER } from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-providers/circuit-breaker'
import { __resetRateLimitStoreForTests } from '../../../../../../supabase/functions/mobile-api/_shared/platform/rate-limit'

const OWNER = '11111111-1111-4111-8111-111111111111'
const STRANGER = '99999999-9999-4999-8999-999999999999'
const SESSION_ID = 'session-hvac-case'
const UNIT_SLOT = 'unit_type_count_and_capacity'
const SLOT_QUESTION = 'Máy treo tường hay âm trần, mấy bộ, công suất khoảng bao nhiêu HP?'
const SCREENSHOT_ANSWER = '2 máy treo tường 1HP.'
const WHY = 'Tại sao chưa đủ dữ kiện?'
const REFUSAL = /ngoài sáu dịch vụ đang hỗ trợ|outside the six supported/
const CANNED_CLARIFICATION = /Bạn muốn Kael hỗ trợ vấn đề nào/

function hvacArtifact(options: { answered: boolean }) {
  const initial = buildInitialDiagnosisScopeArtifact({ serviceType: 'hvac', customerGoal: 'Vệ sinh hai máy lạnh' })
  const asking = diagnosisScopeWithQuestion(initial, [UNIT_SLOT, 'symptom_and_operating_condition'], SLOT_QUESTION, 0.4)
  return options.answered ? diagnosisScopeWithGroundedAnswer(asking, UNIT_SLOT, SCREENSHOT_ANSWER) : asking
}

type SeedOptions = {
  artifact?: unknown
  customerId?: string
  serviceType?: string
  status?: string
  casePhase?: string
  turns?: Array<{ role: 'customer' | 'kael'; text: string }>
  quoteMetadata?: Record<string, unknown>
  slotAsks?: Record<string, number>
}

function seed(options: SeedOptions = {}) {
  const turns = options.turns ?? [
    { role: 'customer', text: 'Mình cần vệ sinh máy lạnh trong nhà.' },
    { role: 'kael', text: SLOT_QUESTION },
    { role: 'customer', text: SCREENSHOT_ANSWER },
  ]
  const session = {
    id: SESSION_ID,
    customer_id: options.customerId ?? OWNER,
    service_type: options.serviceType === undefined ? 'hvac' : options.serviceType,
    status: options.status ?? 'active',
    case_phase: options.casePhase ?? 'analysis',
    total_turns: turns.length,
    total_cost_usd: 0,
    job_id: null,
    diagnosis_scope: options.artifact === undefined ? hvacArtifact({ answered: true }) : options.artifact,
    safe_metadata: { language: 'vi', address_district: 'Quận 7', slot_ask_counts: options.slotAsks ?? {} },
  }
  const reads: string[] = []
  const db = memoryDb({
    kael_chat_sessions: [{ ...session }],
    kael_chat_turns: turns.map((turn, index) => ({
      id: `turn-${index + 1}`,
      session_id: SESSION_ID,
      turn_index: index + 1,
      role: turn.role,
      text_content: turn.text,
      safe_metadata: options.quoteMetadata && turn.role === 'kael' && index === 1 ? options.quoteMetadata : {},
    })),
    service_intake_policies: [],
    jobs: [],
    payments: [],
  })
  const from = db.client.from.bind(db.client)
  db.client.from = (table: string) => {
    reads.push(table)
    return from(table)
  }
  return { db, session, reads }
}

function ask(
  db: ReturnType<typeof memoryDb>,
  session: Record<string, unknown>,
  message: string,
  overrides: { userId?: string; role?: string } = {},
) {
  return answerKaelCaseQuestion({
    ctx: {
      success: true,
      user: { id: overrides.userId ?? OWNER },
      role: overrides.role ?? 'customer',
      supabase: db.client,
    } as never,
    client: db.client as never,
    sessionId: SESSION_ID,
    session,
    message,
    language: 'vi',
    secrets: { knowledgeRetrievalEnabled: false } as never,
    routing: { intent: 'ask_question', source: 'ai', confidence: 0.9 },
  })
}

function kaelReplies(db: ReturnType<typeof memoryDb>) {
  return (db.tables.kael_chat_turns ?? []).filter((turn) => turn.role === 'kael' && !String(turn.id).startsWith('turn-'))
}

function replyOf(db: ReturnType<typeof memoryDb>) {
  return String(kaelReplies(db).at(-1)?.text_content ?? '')
}

function promptMessage(request: Record<string, unknown>, role: 'system' | 'user') {
  const messages = request.messages as Array<{ role: string; content: unknown }>
  const found = messages.find((message) => message.role === role)
  return typeof found?.content === 'string' ? found.content : JSON.stringify(found?.content)
}

// The trusted block the assistant is handed: the JSON line of the system context.
function contextOf(request: Record<string, unknown>) {
  const line = promptMessage(request, 'system').split('\n').find((candidate) => candidate.startsWith('{"platform_scope"'))
  if (!line) throw new Error('system prompt carries no context block')
  return JSON.parse(line) as Record<string, unknown> & { case_context?: Record<string, unknown> }
}

function persisted<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function filler(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? ('kael' as const) : ('customer' as const),
    text: index % 2 === 0 ? `Kael ghi nhận thêm chi tiết số ${index}.` : `Nhà mình ở tầng ${index}, có thang máy.`,
  }))
}

describe('P392 Kael Case context', () => {
  beforeEach(() => {
    hooks.requests.length = 0
  })
  afterEach(() => {
    KAEL_CIRCUIT_BREAKER.reset()
    __resetRateLimitStoreForTests()
  })

  it.each([
    ['the WHY follow-up from the incident', WHY],
    ['the unit answer from the incident', SCREENSHOT_ANSWER],
  ])('keeps the HVAC identity for %s', async (_label, message) => {
    const { db, session } = seed()
    await ask(db, session, message)

    const reply = replyOf(db)
    const why = pillarWhy(PILLAR, `message=${JSON.stringify(message)} providerCalls=${hooks.requests.length} reply=${JSON.stringify(reply.slice(0, 160))}`)
    expect(hooks.requests.length, why).toBe(1)
    expect(hooks.requests[0].purpose, why).toBe('normal_chat_response')
    const context = contextOf(hooks.requests[0])
    expect(context.service_type, why).toBe('hvac')
    expect(context.topic, why).toBe('hvac_service')
    expect(context.case_context?.serviceType, why).toBe('hvac')
    expect(reply, why).not.toMatch(REFUSAL)
    expect(reply, why).not.toMatch(CANNED_CLARIFICATION)
  })

  it('keeps the HVAC identity when the customer corrects an earlier statement in the same breath', async () => {
    const { db, session } = seed()
    await ask(db, session, 'Không phải máy cũ đâu, tại sao vẫn chưa đủ dữ kiện?')

    const reply = replyOf(db)
    const why = pillarWhy(PILLAR, `providerCalls=${hooks.requests.length} reply=${JSON.stringify(reply.slice(0, 160))}`)
    expect(hooks.requests, why).toHaveLength(1)
    expect(contextOf(hooks.requests[0]).topic, why).toBe('hvac_service')
    expect(reply, why).not.toMatch(CANNED_CLARIFICATION)
  })

  it('hands over the known unit facts, the missing facts and the price blockers as typed state', async () => {
    const problemId = '33333333-3333-4333-8333-333333333333'
    const { db, session } = seed({
      artifact: hvacArtifact({ answered: true }),
      quoteMetadata: {
        quote_readiness: EVIDENCE_GAP_QUOTE_READINESS,
        service_problem_id: problemId,
        price_gap_reason: 'no_published_price',
      },
    })
    await ask(db, session, WHY)

    const caseContext = contextOf(hooks.requests[0]).case_context
    const why = pillarWhy(PILLAR, `caseContext=${JSON.stringify(caseContext)}`)
    expect(caseContext?.knownFacts, why).toMatchObject({ [UNIT_SLOT]: SCREENSHOT_ANSWER })
    expect(caseContext?.missingFacts, why).toEqual(['symptom_and_operating_condition'])
    expect(caseContext?.quoteReadiness, why).toBe(EVIDENCE_GAP_QUOTE_READINESS)
    expect(caseContext?.priceBlockerCodes, why).toContain('no_published_price')
    expect(caseContext?.serviceProblemId, why).toBe(problemId)
    expect(caseContext?.casePhase, why).toBe('analysis')
    expect(promptMessage(hooks.requests[0], 'user'), why).toContain('Never state or guess a price')
  })

  it('reports the slot a reply answers while the unit question is still pending', async () => {
    const { db, session } = seed({
      artifact: hvacArtifact({ answered: false }),
      slotAsks: { [UNIT_SLOT]: 1 },
    })
    await ask(db, session, WHY)

    const caseContext = contextOf(hooks.requests[0]).case_context
    const why = pillarWhy(PILLAR, `caseContext=${JSON.stringify(caseContext)}`)
    expect(caseContext?.pendingSlot, why).toBe(UNIT_SLOT)
    expect(caseContext?.missingFacts, why).toContain(UNIT_SLOT)
    expect(caseContext?.knownFacts, why).not.toHaveProperty(UNIT_SLOT)
  })

  it('keeps the HVAC identity and the unit fact when the last eight turns never name the service', async () => {
    const turns = [
      { role: 'customer' as const, text: 'Mình cần vệ sinh máy lạnh trong nhà.' },
      { role: 'kael' as const, text: SLOT_QUESTION },
      { role: 'customer' as const, text: SCREENSHOT_ANSWER },
      ...filler(11),
    ]
    const { db, session } = seed({ turns })
    await ask(db, session, WHY)

    const transcript = promptMessage(hooks.requests[0], 'user')
    const why = pillarWhy(PILLAR, `turns=${turns.length} transcriptNamesService=${/máy lạnh|điều hòa|treo tường/.test(transcript)}`)
    expect(transcript, why).not.toMatch(/máy lạnh|điều hòa|treo tường/)
    const context = contextOf(hooks.requests[0])
    expect(context.service_type, why).toBe('hvac')
    expect(context.topic, why).toBe('hvac_service')
    expect(context.case_context?.knownFacts, why).toMatchObject({ [UNIT_SLOT]: SCREENSHOT_ANSWER })
  })

  it('rehydrates the same context from rows read back after the app reopens', async () => {
    const first = seed()
    await ask(first.db, first.session, WHY)
    const before = contextOf(hooks.requests[0]).case_context

    hooks.requests.length = 0
    const reopened = seed({ artifact: persisted(first.session.diagnosis_scope) })
    await ask(reopened.db, persisted(reopened.session), WHY)

    const why = pillarWhy(PILLAR, `before=${JSON.stringify(before)}`)
    expect(contextOf(hooks.requests[0]).case_context, why).toEqual(before)
  })

  it('never lets a client-supplied service outrank the persisted Case', async () => {
    const { db, session } = seed()
    const built = buildCaseAssistantContext({ session, quoteTurn: null })
    expect(built.ok).toBe(true)
    if (!built.ok) return

    await answerKaelAssistant(
      { success: true, user: { id: OWNER }, role: 'customer', supabase: db.client } as never,
      { language: 'vi', message: WHY, surface: 'customer_normal', service_type: 'plumbing' },
      { knowledgeRetrievalEnabled: false } as never,
      { caseContext: built.context },
    )

    const why = pillarWhy(PILLAR, 'client service_type=plumbing, persisted Case=hvac')
    const context = contextOf(hooks.requests[0])
    expect(context.service_type, why).toBe('hvac')
    expect(context.topic, why).toBe('hvac_service')
  })

  it('refuses a customer who does not own the session before reading anything about it', async () => {
    const { db, session, reads } = seed()
    await expect(ask(db, session, WHY, { userId: STRANGER }), pillarWhy(PILLAR, 'stranger asks about another customer Case'))
      .rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })

    const why = pillarWhy(PILLAR, `reads=${reads.join(',')} providerCalls=${hooks.requests.length}`)
    expect(reads, why).toEqual([])
    expect(hooks.requests, why).toHaveLength(0)
    expect(kaelReplies(db), why).toHaveLength(0)
  })

  it('does not widen access for an admin acting on a customer Case', async () => {
    const { db, session } = seed()
    await expect(ask(db, session, WHY, { userId: STRANGER, role: 'admin' }), pillarWhy(PILLAR, 'admin role does not make the Case theirs'))
      .rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(hooks.requests).toHaveLength(0)
  })

  it('refuses a session row that is not the session being answered', async () => {
    const { db, session } = seed()
    await expect(ask(db, { ...session, id: 'session-someone-else' }, WHY), pillarWhy(PILLAR, 'row id differs from the addressed session'))
      .rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(hooks.requests).toHaveLength(0)
  })

  it.each([
    ['no service on the session', { serviceType: null as unknown as string }, 'service_missing'],
    ['a service outside the six', { serviceType: 'painting' }, 'service_unsupported'],
    ['an artifact that does not parse', { artifact: { version: 1, service_type: 'hvac' } }, 'artifact_invalid'],
    ['an artifact of another service', { artifact: buildInitialDiagnosisScopeArtifact({ serviceType: 'plumbing', customerGoal: 'Rò rỉ ống nước' }) }, 'service_mismatch'],
  ])('answers %s with a state-repair message instead of a scope refusal', async (_label, options, reason) => {
    const { db, session } = seed(options as SeedOptions)
    const before = persisted(db.tables.kael_chat_sessions[0])
    await ask(db, session, WHY)

    const reply = replyOf(db)
    const turn = kaelReplies(db).at(-1)
    const why = pillarWhy(PILLAR, `reason=${reason} reply=${JSON.stringify(reply.slice(0, 160))}`)
    expect(hooks.requests, why).toHaveLength(0)
    expect(reply, why).not.toMatch(REFUSAL)
    expect(reply, why).toContain('chưa đọc được thông tin yêu cầu đã lưu')
    expect((turn?.safe_metadata as Record<string, unknown>).case_context_unreadable, why).toBe(reason)
    const after = db.tables.kael_chat_sessions[0]
    expect(after.service_type, why).toBe(before.service_type)
    expect(after.diagnosis_scope, why).toEqual(before.diagnosis_scope)
    expect(after.job_id, why).toBeNull()
  })

  it('declines a genuinely unsupported service without touching the open Case', async () => {
    const { db, session } = seed()
    const before = persisted(db.tables.kael_chat_sessions[0])
    await ask(db, session, 'Bên bạn có nhận sơn nhà không?')

    const why = pillarWhy(PILLAR, `reply=${JSON.stringify(replyOf(db).slice(0, 160))}`)
    expect(replyOf(db), why).toMatch(REFUSAL)
    expect(hooks.requests, why).toHaveLength(0)
    const after = db.tables.kael_chat_sessions[0]
    expect(after.service_type, why).toBe('hvac')
    expect(after.diagnosis_scope, why).toEqual(before.diagnosis_scope)
    expect(after.case_phase, why).toBe(before.case_phase)
    expect(db.tables.jobs, why).toHaveLength(0)
    expect(db.tables.payments, why).toHaveLength(0)
  })

  it('treats another supported service as a new question and leaves the open Case on HVAC', async () => {
    const { db, session } = seed()
    const before = persisted(db.tables.kael_chat_sessions[0])
    await ask(db, session, 'Vòi nước bồn rửa nhà mình bị rò rỉ, nên làm gì trước?')

    const context = contextOf(hooks.requests[0])
    const why = pillarWhy(PILLAR, `topic=${String(context.topic)} caseService=${String(context.case_context?.serviceType)}`)
    expect(context.topic, why).toBe('plumbing_repair')
    expect(context.case_context?.serviceType, why).toBe('hvac')
    const after = db.tables.kael_chat_sessions[0]
    expect(after.service_type, why).toBe('hvac')
    expect(after.diagnosis_scope, why).toEqual(before.diagnosis_scope)
    expect(db.tables.jobs, why).toHaveLength(0)
  })

  it('creates no job or payment and leaves the saved Case untouched when it explains', async () => {
    const { db, session } = seed()
    const before = persisted(db.tables.kael_chat_sessions[0])
    await ask(db, session, WHY)

    const after = db.tables.kael_chat_sessions[0]
    const why = pillarWhy(PILLAR, 'a clarification must not move workflow or money state')
    expect(db.tables.jobs, why).toHaveLength(0)
    expect(db.tables.payments, why).toHaveLength(0)
    expect(after.job_id, why).toBeNull()
    expect(after.diagnosis_scope, why).toEqual(before.diagnosis_scope)
    expect(after.service_type, why).toBe(before.service_type)
    expect(after.case_phase, why).toBe(before.case_phase)
  })

  it('scrubs contact details from the facts and leaves raw customer text out of the typed state', async () => {
    const base = hvacArtifact({ answered: true })
    const artifact = {
      ...base,
      facts: {
        ...base.facts,
        contact_note: 'Gọi 0901234567 hoặc mail khach@example.com khi tới',
        latest_customer_detail: 'raw detail that must stay in the transcript only',
      },
    }
    const { db, session } = seed({ artifact })
    await ask(db, session, WHY)

    const caseContext = contextOf(hooks.requests[0]).case_context
    const serialized = JSON.stringify(caseContext)
    const why = pillarWhy(PILLAR, `caseContext=${serialized}`)
    expect(serialized, why).not.toContain('0901234567')
    expect(serialized, why).not.toContain('khach@example.com')
    expect(serialized, why).not.toContain('raw detail that must stay')
    expect(serialized, why).not.toContain('Quận 7')
  })

  it('bounds how much of the Case reaches the prompt', () => {
    const base = hvacArtifact({ answered: true })
    const facts = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`fact_${index}`, 'x'.repeat(400)]))
    const built = buildCaseAssistantContext({
      session: { service_type: 'hvac', diagnosis_scope: { ...base, facts, missing_facts: Array.from({ length: 30 }, (_, index) => `slot_${index}`) } },
      quoteTurn: null,
    })
    expect(built.ok).toBe(true)
    if (!built.ok) return
    const why = pillarWhy(PILLAR, `facts=${Object.keys(built.context.knownFacts).length} missing=${built.context.missingFacts.length}`)
    expect(Object.keys(built.context.knownFacts).length, why).toBeLessThanOrEqual(10)
    expect(Object.values(built.context.knownFacts).every((value) => value.length <= 120), why).toBe(true)
    expect(built.context.missingFacts.length, why).toBeLessThanOrEqual(8)
  })

  describe('standalone customer chat', () => {
    const standalone = (message: string) => runCustomerAssistant({
      callAI: async (request) => {
        hooks.requests.push(request as unknown as Record<string, unknown>)
        return { success: true as const, content: JSON.stringify({ answer: 'ok', public_reasoning_summary: [], service_intent: null }), latencyMs: 5, usage: { costUsd: 0, inputTokens: 1, outputTokens: 1 } }
      },
      language: 'vi',
      message,
      secrets: { knowledgeRetrievalEnabled: false },
      surface: 'customer_normal',
    })

    it.each([WHY, SCREENSHOT_ANSWER])('does not invent a service for %s without a Case', async (message) => {
      const answer = await standalone(message)
      const why = pillarWhy(PILLAR, `message=${JSON.stringify(message)} providerCalls=${hooks.requests.length}`)
      expect(hooks.requests, why).toHaveLength(0)
      expect(answer.boundary, why).toBe('redirect')
      expect(answer.answer, why).toMatch(CANNED_CLARIFICATION)
    })

    it('adds no case block to a normal chat prompt', async () => {
      await standalone('Máy lạnh nhà mình không mát, nên kiểm tra gì trước?')
      expect(contextOf(hooks.requests[0]), pillarWhy(PILLAR, 'normal chat prompt')).not.toHaveProperty('case_context')
    })
  })
})
