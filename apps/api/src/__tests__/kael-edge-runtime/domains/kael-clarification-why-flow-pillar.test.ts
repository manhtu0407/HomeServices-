import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { memoryDb } from '../harness/memory-db'
import { buildInitialDiagnosisScopeArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael'
import { prepareKaelChatPrePipeline } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/branches-pre-pipeline'
import { diagnosisScopeWithQuestion } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-work-artifact'

export const PILLAR = {
  id: 'P394-kael-clarification-why-flow',
  invariant:
    'with no model reading of the reply, a WHY question on a pending HVAC slot is explained and never stored as the unit answer, while a real unit answer is stored; neither path prices, creates a Job or a payment, or changes the service',
  authority: [
    'governance/RULES.md #6 (the six services stay the only scope; HVAC identity is retained)',
    'governance/RULES.md #8 (no invented price or fact when the information is missing)',
    'governance/RULES.md #7 (a clarification never crosses a confirmation gate)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/clarification.service.ts',
  layer: 'integration',
  siblings: ['P393-kael-clarification-reply-reading', 'P386-kael-clarification-loop-breaker'],
  mutation:
    'make isClarificationExplanationRequest return false for "Tại sao chưa đủ dữ kiện?" — the question is stored as the unit answer and the explanation case turns red',
} as const satisfies PillarManifest

const SESSION_ID = 'session-hvac-why'
const SLOT = 'unit_type_count_and_capacity'
const UNIT_QUESTION = 'Máy treo tường hay âm trần, mấy bộ, công suất khoảng bao nhiêu HP?'
const progressTarget = { table: 'kael_chat_sessions', id: SESSION_ID } as const

function hvacArtifact() {
  return diagnosisScopeWithQuestion(
    buildInitialDiagnosisScopeArtifact({ serviceType: 'hvac', customerGoal: 'vệ sinh máy lạnh' }),
    [SLOT],
    UNIT_QUESTION,
    0.4,
  )
}

function seed() {
  return memoryDb({
    kael_chat_sessions: [{
      id: SESSION_ID,
      customer_id: 'customer-1',
      service_type: 'hvac',
      status: 'active',
      case_phase: 'analysis',
      total_turns: 3,
      total_cost_usd: 0,
      job_id: null,
      diagnosis_scope: hvacArtifact(),
      safe_metadata: { language: 'vi', slot_ask_counts: { [SLOT]: 1 } },
    }],
    kael_chat_turns: [],
  })
}

async function reply(db: ReturnType<typeof memoryDb>, message: string) {
  return prepareKaelChatPrePipeline({
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
    progressTarget,
    llmClarificationEnabled: false,
  } as never)
}

type Stored = { service_type: string; facts: Record<string, unknown>; missing_facts: string[]; quote_ready: boolean }
const stored = (db: ReturnType<typeof memoryDb>) => db.tables.kael_chat_sessions[0].diagnosis_scope as Stored
const kaelTurns = (db: ReturnType<typeof memoryDb>) => db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael')

function expectNoMoneyOrJob(db: ReturnType<typeof memoryDb>, detail: string) {
  for (const table of ['jobs', 'payments', 'job_payments', 'kael_price_estimates']) {
    expect((db.tables[table] ?? []).length, pillarWhy(PILLAR, `${detail}: ${table} must stay empty`)).toBe(0)
  }
  expect(db.tables.kael_chat_sessions[0].job_id, pillarWhy(PILLAR, `${detail}: no Job is linked`)).toBeNull()
  for (const turn of kaelTurns(db)) {
    expect(String(turn.text_content), pillarWhy(PILLAR, `${detail}: no price in a clarification`))
      .not.toMatch(/\d[\d.,]*\s*(?:đ|₫|vnd|k\b|nghìn|triệu)/i)
    expect(turn.content_type, pillarWhy(PILLAR, `${detail}: not an estimate`)).not.toBe('estimate')
  }
}

describe(`${PILLAR.id}: a WHY question on a pending HVAC slot`, () => {
  it.each([
    'Tại sao chưa đủ dữ kiện?',
    'Vì sao chưa có giá?',
    'Sao vẫn chưa báo được giá?',
    'tai sao chua du du kien',
  ])('explains %j without storing it as the unit answer', async (message) => {
    const db = seed()
    const result = await reply(db, message)

    expect(result.handled, pillarWhy(PILLAR, `${message} must be answered as an explanation`)).toBe(true)
    const turns = kaelTurns(db)
    expect(turns).toHaveLength(1)
    expect(turns[0]?.safe_metadata).toMatchObject({ clarification_source: 'deterministic_explanation' })
    expect(turns[0]?.text_content).toContain('công suất')
    expect(turns[0]?.text_content, pillarWhy(PILLAR, 'HVAC must not be declined as out of scope')).not.toMatch(/ngoài|không hỗ trợ|sáu dịch vụ/i)

    const artifact = stored(db)
    expect(artifact.service_type).toBe('hvac')
    expect(db.tables.kael_chat_sessions[0].service_type).toBe('hvac')
    expect(artifact.facts, pillarWhy(PILLAR, 'the question is not a fact')).not.toHaveProperty(SLOT)
    expect(artifact.missing_facts).toContain(SLOT)
    expect(artifact.quote_ready).toBe(false)
    expectNoMoneyOrJob(db, message)
  })
})

describe(`${PILLAR.id}: a unit answer on the same pending slot`, () => {
  // The unit answer closes the slot, so the turn moves on to the next real blocker (the district) instead of explaining.
  function expectStoredThenNextBlocker(db: ReturnType<typeof memoryDb>, stored_text: string, detail: string) {
    const artifact = stored(db)
    expect(artifact.facts[SLOT], pillarWhy(PILLAR, `${detail}: the unit answer fills the slot`)).toBe(stored_text)
    expect(artifact.missing_facts).not.toContain(SLOT)
    expect(artifact.service_type).toBe('hvac')
    const turns = kaelTurns(db)
    expect(turns).toHaveLength(1)
    expect(turns[0]?.safe_metadata, pillarWhy(PILLAR, `${detail}: the explanation route stays unused`))
      .not.toMatchObject({ clarification_source: 'deterministic_explanation' })
    expect(turns[0]?.safe_metadata, pillarWhy(PILLAR, `${detail}: Kael names the real remaining blocker`))
      .toMatchObject({ artifact_proposal: { missing_fields: ['address_district'] } })
    expectNoMoneyOrJob(db, detail)
  }

  it('stores the exact incident answer and asks for the next real blocker', async () => {
    const db = seed()
    await reply(db, '2 máy treo tường 1HP.')
    expectStoredThenNextBlocker(db, '2 máy treo tường 1HP.', 'unit answer')
  })

  it('keeps the fact when the same message also asks what is missing', async () => {
    const db = seed()
    await reply(db, '2 máy 1HP, còn thiếu gì?')
    expectStoredThenNextBlocker(db, '2 máy 1HP, còn thiếu gì?', 'fact + question')
  })
})
