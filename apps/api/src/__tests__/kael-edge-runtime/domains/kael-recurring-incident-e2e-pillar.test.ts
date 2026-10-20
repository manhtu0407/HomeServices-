import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { diagnosisScopeWithGroundedAnswer } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-work-artifact'
import {
  CASE_ADMIN_ID,
  CASE_SESSION_ID,
  EXPLANATION_ANSWER,
  HVAC_UNIT_SLOT,
  OWNER,
  STRANGER,
  assistantReply,
  classifierReply,
  createCaseWorld,
  hvacPendingUnitArtifact,
  hvacPolicyRows,
  installEdgeRuntimeTestHooks,
  networkFailure,
  providerDown,
  providerMalformed,
  providerWrongShape,
  unitAnswered,
  type CaseWorld,
  type ModelReplyFn,
} from '../harness'

export const PILLAR = {
  id: 'P398-kael-recurring-incident-e2e',
  invariant:
    'a supported HVAC Case keeps its identity across a stateful exchange through the real HTTP handler, classifier, permission gate, Case context and serializer: the unit answer is stored, a WHY question is explained and never stored, nothing is priced, confirmed, matched or paid from a clarification, and a genuinely unsupported service or another customer is still refused',
  authority: [
    'governance/RULES.md #6 (six supported services; HVAC is never narrowed or dropped mid-Case)',
    'governance/RULES.md #7 (raw model output and client input never cross a confirmation gate)',
    'governance/RULES.md #8 (no invented price; a missing provider is a safe fallback, not a refusal)',
    'governance/RULES.md #4 (price needs validated evidence; a worker quote needs the customer to approve it)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/turn.ts',
  layer: 'integration',
  siblings: ['P392-kael-case-context', 'P393-kael-turn-intent-fallback', 'P396-kael-clarification-why-flow', 'P363-kael-turn-intent-router'],
  mutation:
    'stop passing the persisted Case service to the assistant, or let a classifier failure fall back to provide_information for a WHY question - the incident rows turn red while every router-level mock stays green',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const UNIT_ANSWER = '2 máy treo tường 1HP.'
const WHY = 'Tại sao chưa đủ dữ kiện?'
const GO_AHEAD = 'Ok đặt luôn đi'
const REFUSAL = /ngoài sáu dịch vụ đang hỗ trợ|ngoài phạm vi sáu nhóm|outside the six supported/i
const CANNED_REDIRECT = /Bạn muốn Kael hỗ trợ vấn đề nào/
const PRICE_IN_TEXT = /\d[\d.,]*\s*(?:đ|₫|vnd|k\b|nghìn|triệu)/i
const PRICE_EVIDENCE_REASON = 'validated_price_evidence_unavailable'
const FIXTURE_DIR = resolve(__dirname, '../fixtures/hvac-recurring-incident')
const WRITE_FIXTURES = process.env.KAEL_E2E_FIXTURES_WRITE === '1'
const SEEDED_TURN_PREFIX = '39800000-0000-4000-8000-0000000001'

// A healthy provider: the classifier reads only the latest customer message.
const healthyModel: ModelReplyFn = (call) => {
  if (call.purpose === 'case_turn_intent') {
    const said = call.userContent
    if (said.includes('Tại sao') || said.includes('Vì sao')) {
      return classifierReply({ intent: 'ask_question', confidence: 0.92, pending_slot_answer: { kind: 'asks_why', slot: HVAC_UNIT_SLOT, value: null, confidence: 0.9 } })
    }
    if (said.includes('đặt luôn')) return classifierReply({ intent: 'proceed_or_confirm', confidence: 0.9 })
    if (said.includes('quận 3')) return classifierReply({ intent: 'correction', confidence: 0.9, answered_slots: [{ slot: 'address_district', value: 'Quận 3' }] })
    if (said.includes('nhầm')) return classifierReply({ intent: 'correction', confidence: 0.9, answered_slots: [{ slot: HVAC_UNIT_SLOT, value: '2 máy treo tường 2HP' }] })
    return classifierReply({ intent: 'provide_information', confidence: 0.9, pending_slot_answer: unitAnswered('2 máy treo tường 1HP') })
  }
  if (call.purpose === 'normal_chat_response') return assistantReply()
  return { content: '{}' }
}

const withoutClassifier = (failure: (call: Parameters<ModelReplyFn>[0]) => ReturnType<ModelReplyFn>): ModelReplyFn =>
  (call) => (call.purpose === 'case_turn_intent' ? failure(call) : healthyModel(call))

type Trace = Record<string, unknown>
const traceOf = (turn: Record<string, unknown> | undefined): Trace | undefined =>
  (turn?.safe_metadata as { turn_trace?: Trace } | undefined)?.turn_trace

const lastKael = (world: CaseWorld) => world.kaelTurns().at(-1)
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function assertCaseStillSafe(world: CaseWorld, why: string, options: { allowDecline?: boolean } = {}) {
  expect(world.session().service_type, pillarWhy(PILLAR, `${why}: session service`)).toBe('hvac')
  expect(world.scope().service_type, pillarWhy(PILLAR, `${why}: artifact service`)).toBe('hvac')
  expect(world.session().job_id, pillarWhy(PILLAR, `${why}: no Job is linked`)).toBeNull()
  expect(world.unexpectedWrites(), pillarWhy(PILLAR, `${why}: only chat tables may be written`)).toEqual([])
  for (const turn of world.kaelTurns()) {
    if (String(turn.id).startsWith(SEEDED_TURN_PREFIX)) continue
    expect(String(turn.text_content), pillarWhy(PILLAR, `${why}: no price in a clarification`)).not.toMatch(PRICE_IN_TEXT)
    expect(turn.content_type, pillarWhy(PILLAR, `${why}: no estimate`)).not.toBe('estimate')
    if (options.allowDecline) continue
    expect(String(turn.text_content), pillarWhy(PILLAR, `${why}: HVAC is never declined as out of scope`)).not.toMatch(REFUSAL)
    expect(traceOf(turn)?.permission_reason, pillarWhy(PILLAR, `${why}: permission reason`)).not.toBe('DENY_OUT_OF_SCOPE_SERVICE')
  }
}

// The facts a clarification turn must not touch: the service, the stored answers and what is still missing.
function caseIdentity(world: CaseWorld) {
  const scope = world.scope()
  return clone({
    service_type: scope.service_type,
    profile_id: scope.profile_id,
    facts: scope.facts,
    missing_facts: scope.missing_facts,
    evidence: scope.evidence,
    safety_flags: scope.safety_flags,
    quote_ready: scope.quote_ready,
  })
}

function assistantContext(call: { body: { messages?: readonly unknown[] } }) {
  const system = (call.body.messages as Array<{ role: string; content: unknown }>).find((message) => message.role === 'system')
  const line = String(system?.content).split('\n').find((candidate) => candidate.startsWith('{"platform_scope"'))
  if (!line) throw new Error('assistant system prompt carries no context block')
  return JSON.parse(line) as Record<string, unknown> & { case_context?: Record<string, unknown> }
}

describe.each([
  ['HVAC playbook off', false],
  ['HVAC playbook on', true],
])(`${PILLAR.id}: the screenshot exchange, stateful (%s)`, (_label, hvacPlaybook) => {
  it('R01 stores the unit answer on turn 1, then explains the WHY on turn 2 without moving the Case', async () => {
    const world = createCaseWorld({ model: healthyModel, hvacPlaybook })

    const first = await world.send(UNIT_ANSWER)
    const why1 = pillarWhy(PILLAR, `turn 1 status=${first.status} purposes=${first.purposes.join(',')}`)
    expect(first.status, why1).toBe(200)
    expect(world.scope().facts[HVAC_UNIT_SLOT], why1).toContain('2 máy treo tường 1HP')
    expect(world.scope().missing_facts, why1).not.toContain(HVAC_UNIT_SLOT)
    expect(world.scope().next_action, why1).toMatchObject({ kind: 'escalate', reason: PRICE_EVIDENCE_REASON })
    expect(world.scope().quote_blockers, why1).toContain('validated_price_evidence')
    expect(world.scope().quote_ready, why1).toBe(false)
    assertCaseStillSafe(world, 'after turn 1')

    const identity = caseIdentity(world)
    const second = await world.send(WHY)
    const why2 = pillarWhy(PILLAR, `turn 2 status=${second.status} purposes=${second.purposes.join(',')}`)
    expect(second.status, why2).toBe(200)
    expect(second.purposes, why2).toEqual(['deepseek:case_turn_intent', 'deepseek:normal_chat_response'])
    expect(caseIdentity(world), why2).toEqual(identity)
    const reply = lastKael(world)
    expect(reply?.text_content, why2).toBe(EXPLANATION_ANSWER)
    expect(reply?.content_type, why2).toBe('clarification')
    expect(traceOf(reply), why2).toMatchObject({ route: 'case_work_question', service_code: 'hvac', intent: 'ask_question', intent_source: 'ai' })
    assertCaseStillSafe(world, 'after turn 2')
  })
})

describe(`${PILLAR.id}: the classifier is unavailable on both turns`, () => {
  const failures: Array<[string, ModelReplyFn]> = [
    ['R02 provider returns 503', withoutClassifier(() => providerDown)],
    ['R03 provider times out', withoutClassifier(() => networkFailure('TimeoutError'))],
    ['R04 provider connection fails', withoutClassifier(() => networkFailure('TypeError'))],
    ['R05 provider returns malformed JSON', withoutClassifier(() => providerMalformed)],
    ['R06 provider returns the wrong shape', withoutClassifier(() => providerWrongShape)],
    ['R07 provider answers with low confidence', withoutClassifier(() => classifierReply({ intent: 'provide_information', confidence: 0.2 }))],
  ]

  it.each(failures)('%s: HVAC kept, unit answer stored, WHY explained', async (name, model) => {
    const world = createCaseWorld({ model })

    await world.send(UNIT_ANSWER)
    expect(world.scope().facts[HVAC_UNIT_SLOT], pillarWhy(PILLAR, `${name}: turn 1 facts=${JSON.stringify(world.scope().facts)}`)).toContain('2 máy treo tường 1HP')
    assertCaseStillSafe(world, `${name} turn 1`)

    const identity = caseIdentity(world)
    const second = await world.send(WHY)
    const reply = lastKael(world)
    const why2 = pillarWhy(PILLAR, `${name}: turn 2 purposes=${second.purposes.join(',')} reply=${JSON.stringify(String(reply?.text_content).slice(0, 120))}`)
    expect(second.status, why2).toBe(200)
    expect(world.session().safe_metadata.last_turn_intent, why2).toMatchObject({ intent: 'ask_question', source: 'fallback' })
    expect(caseIdentity(world), `${why2} (the WHY must not be stored as a fact)`).toEqual(identity)
    expect(reply?.text_content, why2).not.toMatch(CANNED_REDIRECT)
    assertCaseStillSafe(world, `${name} turn 2`)
  })
})

describe(`${PILLAR.id}: the answering provider and the history`, () => {
  it('R08 an unavailable assistant provider yields a safe fallback, not a scope refusal', async () => {
    const world = createCaseWorld({ model: (call) => (call.purpose === 'normal_chat_response' ? providerDown : healthyModel(call)) })
    await world.send(UNIT_ANSWER)
    const identity = caseIdentity(world)

    const second = await world.send(WHY)
    const reply = lastKael(world)
    const why = pillarWhy(PILLAR, `purposes=${second.purposes.join(',')} reply=${JSON.stringify(String(reply?.text_content).slice(0, 120))}`)
    expect(second.status, why).toBe(200)
    expect(String(reply?.text_content), why).toContain('Yêu cầu của bạn vẫn giữ nguyên')
    expect(reply?.safe_metadata, why).toMatchObject({ fallback_used: true })
    expect(traceOf(reply), why).toMatchObject({ stage: 'answer_unavailable', fallback_used: true, service_code: 'hvac' })
    expect(caseIdentity(world), why).toEqual(identity)
    assertCaseStillSafe(world, 'assistant down')
  })

  it('R09 eleven earlier turns that never name the service still reach the assistant as HVAC', async () => {
    const world = createCaseWorld({ model: healthyModel, filler: 11, policies: hvacPolicyRows({ rfq: false }) })
    await world.seedPriceEvidenceGap()
    const second = await world.send(WHY)

    const call = second.calls.find((candidate) => candidate.purpose === 'normal_chat_response')
    expect(call, pillarWhy(PILLAR, `purposes=${second.purposes.join(',')}`)).toBeDefined()
    const context = assistantContext(call!)
    const transcript = call!.userContent
    const why = pillarWhy(PILLAR, `service_type=${String(context.service_type)} topic=${String(context.topic)} case_context=${JSON.stringify(context.case_context)}`)
    expect(transcript, `${why} (the recent turns must not carry the answer on their own)`).not.toMatch(/2 máy/)
    expect(context.service_type, why).toBe('hvac')
    expect(context.topic, why).toBe('hvac_service')
    expect(context.case_context, why).toMatchObject({ serviceType: 'hvac' })
    expect(context.case_context?.knownFacts, why).toMatchObject({ [HVAC_UNIT_SLOT]: expect.stringContaining('2 máy treo tường 1HP') })
    assertCaseStillSafe(world, 'long history')
  })

  it('R10 a Case reopened with an offer under review keeps the offer after a question', async () => {
    const world = createCaseWorld({ model: healthyModel, status: 'estimate_ready', casePhase: 'offer_review' })
    const second = await world.send(WHY)

    const why = pillarWhy(PILLAR, `purposes=${second.purposes.join(',')} status=${String(world.session().status)}`)
    expect(second.status, why).toBe(200)
    expect(world.session().status, `${why} (a question must not discard the offer)`).toBe('estimate_ready')
    expect(world.session().case_phase, why).toBe('offer_review')
    expect(world.session().job_id, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })
})

describe(`${PILLAR.id}: scope boundary and ownership`, () => {
  it('R11 a genuinely unsupported service is declined and the HVAC Case keeps its facts', async () => {
    const world = createCaseWorld({ model: healthyModel })
    const identity = caseIdentity(world)

    const result = await world.send('Bên bạn có nhận sơn nhà không?')
    const reply = lastKael(world)
    const why = pillarWhy(PILLAR, `status=${result.status} reply=${JSON.stringify(String(reply?.text_content).slice(0, 120))}`)
    expect(result.status, why).toBe(200)
    expect(String(reply?.text_content), why).toMatch(REFUSAL)
    expect(reply?.safe_metadata, why).toMatchObject({ boundary_reason: 'out_of_scope' })
    expect(result.purposes, `${why} (the decline is deterministic, no model is asked)`).toEqual([])
    expect(caseIdentity(world), why).toEqual(identity)
    assertCaseStillSafe(world, 'unsupported service', { allowDecline: true })
  })

  it.each([
    ['R12 another customer', STRANGER, 404],
    ['R13 a worker', { id: STRANGER.id, role: 'worker' as const }, 403],
    ['R14 an admin', { id: CASE_ADMIN_ID, role: 'admin' as const }, 403],
  ])('%s cannot write into the Case or reach a model', async (name, actor, status) => {
    const world = createCaseWorld({ model: healthyModel })
    await world.send(UNIT_ANSWER)
    const before = clone({ session: world.session(), turns: world.db.tables.kael_chat_turns })
    const callsBefore = world.modelCalls.length

    const result = await world.send(WHY, { as: actor })
    const why = pillarWhy(PILLAR, `${name}: status=${result.status} body=${JSON.stringify(result.body).slice(0, 120)}`)
    expect(result.status, why).toBe(status)
    expect(world.modelCalls.length, `${why} (no model call for a refused actor)`).toBe(callsBefore)
    expect(clone({ session: world.session(), turns: world.db.tables.kael_chat_turns }), `${why} (nothing is written)`).toEqual(before)
    expect(JSON.stringify(result.body), `${why} (a refusal reveals nothing about the Case)`).not.toContain('hvac')
  })
})

describe(`${PILLAR.id}: scope facts, price evidence and safety`, () => {
  it('R15 a missing district stays the one real blocker: no price lookup, WHY explained, question kept', async () => {
    const world = createCaseWorld({ model: healthyModel, district: null })
    const first = await world.send(UNIT_ANSWER)
    const why1 = pillarWhy(PILLAR, `turn 1 purposes=${first.purposes.join(',')}`)
    expect(first.purposes.filter((purpose) => !purpose.startsWith('deepseek:')), `${why1} (no market lookup while the scope is incomplete)`).toEqual([])
    expect(world.scope().missing_facts, why1).toEqual(['address_district'])
    expect(world.scope().facts[HVAC_UNIT_SLOT], why1).toContain('2 máy treo tường 1HP')

    await world.send(WHY)
    const why2 = pillarWhy(PILLAR, `after WHY scope=${JSON.stringify(world.scope().next_action)}`)
    expect(world.scope().missing_facts, why2).toEqual(['address_district'])
    expect(world.scope().next_action, `${why2} (the district question stays pending)`).toMatchObject({ kind: 'ask_question' })
    assertCaseStillSafe(world, 'missing district')
  })

  it('R16 the price-gap chip is answered without the classifier and never invents a price', async () => {
    const world = createCaseWorld({ model: healthyModel, policies: hvacPolicyRows({ rfq: false }) })
    await world.seedPriceEvidenceGap()

    const result = await world.send('Vì sao Kael chưa đưa ra giá cho việc này?', { chip: 'ask_question' })
    const reply = lastKael(world)
    const why = pillarWhy(PILLAR, `purposes=${result.purposes.join(',')}`)
    expect(result.purposes, why).toEqual(['deepseek:normal_chat_response'])
    expect(traceOf(reply), `${why} trace=${JSON.stringify(traceOf(reply))}`).toMatchObject({ intent: 'ask_question', intent_source: 'chip', service_code: 'hvac' })
    assertCaseStillSafe(world, 'price-gap chip')
  })

  it('R17 an HVAC hazard message gets deterministic safety guidance, not a classifier or a price', async () => {
    const world = createCaseWorld({ model: healthyModel, hvacPlaybook: true })
    const result = await world.send('Máy lạnh nhà mình bốc khói và có mùi khét, tia lửa điện ở ổ cắm')

    const reply = lastKael(world)
    const why = pillarWhy(PILLAR, `purposes=${result.purposes.join(',')} reply=${JSON.stringify(String(reply?.text_content).slice(0, 120))}`)
    expect(result.purposes, `${why} (a safety turn is not routed through the classifier)`).not.toContain('deepseek:case_turn_intent')
    expect(String(reply?.text_content), why).toContain('aptomat')
    assertCaseStillSafe(world, 'safety hold')
  })

  it('R18 without the HVAC playbook a hazard message still prices nothing and creates no Job', async () => {
    const world = createCaseWorld({ model: healthyModel, hvacPlaybook: false })
    await world.send('Máy lạnh nhà mình bốc khói và có mùi khét, tia lửa điện ở ổ cắm')
    assertCaseStillSafe(world, 'hazard, playbook off')
  })
})

describe(`${PILLAR.id}: worker quote and explicit acceptance`, () => {
  it('R19 RFQ enabled: the worker-quote chip prepares a review for the customer, with no price and no Job', async () => {
    const world = createCaseWorld({ model: healthyModel, policies: hvacPolicyRows({ rfq: true }) })
    await world.seedPriceEvidenceGap()

    const result = await world.send('Gửi thợ báo giá giúp mình', { chip: 'request_worker_quote' })
    const why = pillarWhy(PILLAR, `status=${result.status} coverage=${JSON.stringify(result.body.session?.intake_coverage)}`)
    expect(result.status, why).toBe(200)
    expect(world.session().status, why).toBe('estimate_ready')
    expect(result.body.session.intake_coverage, why).toMatchObject({ confirmation_kind: 'rfq_request', quote_mode: 'rfq' })
    expect(result.body.session.job_id ?? null, `${why} (the customer has not confirmed anything)`).toBeNull()
    assertCaseStillSafe(world, 'rfq review')
  })

  it('R20 RFQ disabled: the worker-quote chip is refused by policy and the Case stays in the gap', async () => {
    const world = createCaseWorld({ model: healthyModel, policies: hvacPolicyRows({ rfq: false }) })
    await world.seedPriceEvidenceGap()

    const result = await world.send('Gửi thợ báo giá giúp mình', { chip: 'request_worker_quote' })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(world.session().status, why).toBe('active')
    expect(lastKael(world)?.safe_metadata, why).toMatchObject({ worker_quote_unavailable_reason: 'policy_disallows' })
    assertCaseStillSafe(world, 'rfq disabled')
  })

  it('R21 "go ahead" in the price gap confirms nothing and says there is no offer yet', async () => {
    const world = createCaseWorld({ model: healthyModel })
    await world.seedPriceEvidenceGap()

    const result = await world.send(GO_AHEAD)
    const why = pillarWhy(PILLAR, `purposes=${result.purposes.join(',')}`)
    expect(String(lastKael(world)?.text_content), why).toContain('chưa có giá đã kiểm chứng')
    expect(world.session().status, why).toBe('active')
    assertCaseStillSafe(world, 'go ahead in gap')
  })

  it('R22 "go ahead" with an RFQ review waiting points to the confirm button and keeps the review', async () => {
    const world = createCaseWorld({ model: healthyModel, policies: hvacPolicyRows({ rfq: true }) })
    await world.seedPriceEvidenceGap()
    await world.send('Gửi thợ báo giá giúp mình', { chip: 'request_worker_quote' })

    const result = await world.send(GO_AHEAD)
    const why = pillarWhy(PILLAR, `purposes=${result.purposes.join(',')} status=${String(world.session().status)}`)
    expect(result.purposes, `${why} (no price research may restart under a pending review)`).toEqual(['deepseek:case_turn_intent'])
    expect(String(lastKael(world)?.text_content), why).toContain('bấm nút xác nhận')
    expect(world.session().status, `${why} (the review must survive the message)`).toBe('estimate_ready')
    assertCaseStillSafe(world, 'go ahead under review')
  })
})

// What the mobile quote card reads from the response of the real route: the persisted artifact and policy coverage.
function clientPayload(body: Record<string, any>) {
  const session = body.session
  return clone({
    status: session.status,
    case_phase: session.case_phase,
    next_action: session.next_action,
    intake_coverage: session.intake_coverage,
    diagnosis_scope: { ...session.diagnosis_scope, updated_at: '<time>' },
  })
}

function matchesFixture(name: string, actual: unknown) {
  const file = resolve(FIXTURE_DIR, `${name}.json`)
  const serialized = `${JSON.stringify(actual, null, 2)}
`
  if (WRITE_FIXTURES) {
    mkdirSync(FIXTURE_DIR, { recursive: true })
    writeFileSync(file, serialized)
  }
  expect(existsSync(file), pillarWhy(PILLAR, `missing fixture ${name}.json; run with KAEL_E2E_FIXTURES_WRITE=1`)).toBe(true)
  expect(JSON.parse(readFileSync(file, 'utf8')), pillarWhy(PILLAR, `${name} drifted from what the real route sends the client`)).toEqual(JSON.parse(serialized))
}

describe(`${PILLAR.id}: what the client receives`, () => {
  it('R23 the route sends the structured blocker on turn 1 and the same payload shape the mobile card reads on turn 2', async () => {
    const world = createCaseWorld({ model: healthyModel })
    const first = await world.send(UNIT_ANSWER)
    expect(first.body.session.diagnosis_scope.quote_blockers, pillarWhy(PILLAR, 'turn 1 response')).toContain('validated_price_evidence')
    matchesFixture('01-after-unit-answer', clientPayload(first.body))

    const second = await world.send(WHY)
    expect(second.body.session.diagnosis_scope.service_type, pillarWhy(PILLAR, 'turn 2 response')).toBe('hvac')
    matchesFixture('02-after-why-question', clientPayload(second.body))
  })
})

describe(`${PILLAR.id}: review findings on the correction and restore paths`, () => {
  it('R24 a correction names its slots in the contract the model is shown whenever details are recorded', async () => {
    const world = createCaseWorld({ model: healthyModel })
    await world.send(UNIT_ANSWER)
    const second = await world.send(WHY)

    const classifier = second.calls.find((call) => call.purpose === 'case_turn_intent')
    const system = (classifier!.body.messages as Array<{ role: string; content: string }>).find((message) => message.role === 'system')!.content
    const why = pillarWhy(PILLAR, 'no question is pending on turn 2, details are recorded')
    expect(system, why).toContain('"answered_slots": [...]')
    expect(classifier!.userContent, why).toContain('filled_slots')
  })

  it('R25 a failed reload of the Case after an answered turn is an error, not a silent loss of the blocker', async () => {
    const world = createCaseWorld({ model: healthyModel, policies: hvacPolicyRows({ rfq: false }) })
    await world.seedPriceEvidenceGap()
    const from = world.db.client.from.bind(world.db.client)
    world.db.client.from = (table: string) => {
      const query = from(table) as Record<string, any>
      const select = query.select.bind(query)
      query.select = (columns?: string) => {
        if (table === 'kael_chat_sessions' && columns === 'diagnosis_scope') {
          return { eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'timeout' } }) }) }
        }
        return select(columns)
      }
      return query
    }

    const result = await world.send(WHY)
    expect(result.status, pillarWhy(PILLAR, `status=${result.status}`)).toBe(500)
  })

  it('R26 a corrected district beats the first district named in the same message and is saved', async () => {
    const artifact = diagnosisScopeWithGroundedAnswer(hvacPendingUnitArtifact(), 'address_district', 'Quận 7')
    const world = createCaseWorld({ model: healthyModel, artifact })
    const result = await world.send('Nhầm rồi, không phải quận 7 mà là quận 3')

    const why = pillarWhy(PILLAR, `status=${result.status} metadata=${JSON.stringify(world.session().safe_metadata)} purposes=${result.purposes.join(',')}`)
    expect(world.session().safe_metadata.address_district, why).toBe('q3')
    expect(world.scope().facts.address_district, why).toContain('3')
    const pipelinePrompts = result.calls.filter((call) => call.purpose === 'unknown').map((call) => call.userContent).join(' ')
    expect(pipelinePrompts, why).not.toMatch(/District: q7/)
  })
})

describe(`${PILLAR.id}: defects this suite found, now fixed`, () => {
  it('D1 a WHY answered without re-analysis keeps the recorded quote blocker', async () => {
    const world = createCaseWorld({ model: healthyModel })
    await world.send(UNIT_ANSWER)
    expect(world.scope().quote_blockers).toContain('validated_price_evidence')

    await world.send(WHY)
    const why = pillarWhy(PILLAR, `blockers=${JSON.stringify(world.scope().quote_blockers)} next=${JSON.stringify(world.scope().next_action)}`)
    expect(world.scope().quote_blockers, why).toContain('validated_price_evidence')
    expect(world.scope().next_action, why).toMatchObject({ kind: 'escalate', reason: PRICE_EVIDENCE_REASON })
  })

  it('D2 a corrected unit answer replaces the stored 1HP fact', async () => {
    const world = createCaseWorld({ model: healthyModel })
    await world.send(UNIT_ANSWER)

    await world.send('À nhầm, là 2 máy 2HP chứ không phải 1HP')
    const stored = String(world.scope().facts[HVAC_UNIT_SLOT])
    const why = pillarWhy(PILLAR, `stored unit fact=${JSON.stringify(stored)}`)
    expect(stored, why).toMatch(/2\s*HP/i)
    expect(stored, why).not.toMatch(/1\s*HP/i)
  })
})
