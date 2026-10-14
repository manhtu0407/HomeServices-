import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { memoryDb } from '../harness/memory-db'
import { buildInitialDiagnosisScopeArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael'
import { prepareKaelChatPrePipeline } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/branches-pre-pipeline'
import {
  diagnosisScopeWithQuestion,
  pendingClarificationSlotOf,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-work-artifact'
import { resolveKaelChatAddressDistrict } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/intake'
import { classifyCaseTurnIntent } from '../../../../../../supabase/functions/mobile-api/_shared/kael/tools/case-turn-intent'
import { appendKaelSystemTurn } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/session-store'

export const PILLAR = {
  id: 'P385-kael-turn-understanding',
  invariant:
    'a customer reply fills the detail Kael asked about, in the customer’s own words, and is never read as an answer before Kael has really asked: a district named inline resolves, a reply the model read as another topic fills nothing, and extra details in the same message are kept',
  authority: [
    'governance/RULES.md #8 (an unanswered detail stays missing; nothing is invented)',
    'governance/RULES.md #7 (the reply changes the case record only; no gate is crossed)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/branches-pre-pipeline.ts',
  layer: 'unit',
  siblings: ['P363-kael-turn-intent-router', 'P386-kael-clarification-loop-breaker'],
  mutation:
    'drop the artifact.facts.address_district source in resolvePrePipelineIntake — the Gò Vấp case asks the district again and turns red; ground every reply regardless of understanding.kind — the "other" case turns red; make pendingClarificationSlotOf ignore the ask count — the fresh-artifact case turns red',
} as const satisfies PillarManifest

const SESSION_ID = 'session-understanding'

function seed(artifact: unknown, safeMetadata: Record<string, unknown> = {}) {
  return memoryDb({
    kael_chat_sessions: [{
      id: SESSION_ID,
      customer_id: 'customer-1',
      service_type: 'handyman',
      status: 'active',
      case_phase: 'analysis',
      total_turns: 2,
      total_cost_usd: 0,
      job_id: null,
      diagnosis_scope: artifact,
      safe_metadata: { language: 'vi', ...safeMetadata },
    }],
    kael_chat_turns: [],
  })
}

function prepare(db: ReturnType<typeof memoryDb>, message: string, extra: Record<string, unknown> = {}) {
  return prepareKaelChatPrePipeline({
    client: db.client as never,
    sessionId: SESSION_ID,
    actorId: 'customer-1',
    message,
    serviceType: 'handyman',
    safeCustomerEvidence: message,
    durableCustomerDetail: message,
    problemChips: [],
    language: 'vi',
    earlySafetySignals: [],
    progressTarget: { table: 'kael_chat_sessions', id: SESSION_ID },
    llmClarificationEnabled: true,
    ...extra,
  } as never)
}

const fresh = () => buildInitialDiagnosisScopeArtifact({ serviceType: 'handyman', customerGoal: 'lắp kệ' })
const asking = (slots: string[], question = 'Bạn cho Kael biết quận ở TP.HCM?') =>
  diagnosisScopeWithQuestion(fresh(), slots, question, 0.3)
const storedArtifact = (db: ReturnType<typeof memoryDb>) => db.tables.kael_chat_sessions[0].diagnosis_scope as {
  facts: Record<string, unknown>
  missing_facts: string[]
  next_action: { kind: string }
}

describe(`${PILLAR.id}: the reply answers the question that was asked`, () => {
  it('resolves every HCMC district named inline, with or without diacritics', () => {
    for (const [text, slug] of [
      ['mình ở Gò Vấp', 'go_vap'],
      ['nhà ở tân bình nhé', 'tan_binh'],
      ['Phu Nhuan', 'phu_nhuan'],
      ['căn hộ bên Bình Tân', 'binh_tan'],
      ['Bình Thạnh', 'binh_thanh'],
      ['ở quận 7', 'q7'],
    ] as const) {
      expect(resolveKaelChatAddressDistrict(text), pillarWhy(PILLAR, text)).toBe(slug)
    }
    expect(resolveKaelChatAddressDistrict('mình ở Biên Hòa')).toBeNull()
    expect(resolveKaelChatAddressDistrict('mình cần giờ để kiểm tra lại cái kệ'), pillarWhy(PILLAR, 'an ordinary phrase is not Cần Giờ')).toBeNull()
    expect(resolveKaelChatAddressDistrict('mình ở Cần Giờ')).toBe('can_gio')
  })

  it('does not ask the district again once the customer named it', async () => {
    const db = seed(asking(['address_district']), { slot_ask_counts: { address_district: 1 } })
    const result = await prepare(db, 'mình ở Gò Vấp')
    expect(result.handled, pillarWhy(PILLAR, 'the answer was in the reply')).toBe(false)
    if (!result.handled) expect(result.district).toBe('go_vap')
    expect(db.tables.kael_chat_turns).toHaveLength(0)
  })

  it('treats a first message as an answer only after Kael has asked', () => {
    const artifact = fresh()
    expect(artifact.missing_facts.length).toBeGreaterThan(1)
    expect(pendingClarificationSlotOf(artifact, {}), pillarWhy(PILLAR, 'a new case has asked nothing yet')).toBeNull()
    expect(pendingClarificationSlotOf(asking([artifact.missing_facts[0], artifact.missing_facts[1]]), { [artifact.missing_facts[0]]: 1 }))
      .toBe(artifact.missing_facts[0])
    expect(pendingClarificationSlotOf(asking(['address_district']), {})).toBe('address_district')
  })

  it('files the customer’s own words under the detail asked and keeps extra details from the same message', async () => {
    const base = fresh()
    const [first, second] = base.missing_facts
    const db = seed(asking([first, second], 'Vật cần treo nặng khoảng bao nhiêu?'), { slot_ask_counts: { [first]: 1 }, address_district: 'q1' })
    await prepare(db, 'khoảng 2kg, tường gạch', {
      address_district: 'q1',
      slotUnderstanding: {
        kind: 'answered',
        slot: first,
        value: 'khoảng 2kg',
        answeredSlots: [{ slot: second, value: 'tường gạch' }],
      },
    })
    const stored = storedArtifact(db)
    expect(stored.facts[first], pillarWhy(PILLAR, 'the model’s reading, not the whole message')).toBe('khoảng 2kg')
    expect(stored.facts[second]).toBe('tường gạch')
    expect(stored.missing_facts).not.toContain(first)
    expect(stored.missing_facts).not.toContain(second)
  })

  it('keeps a volunteered detail even when the asked one is "I do not know"', async () => {
    const [first, second] = fresh().missing_facts
    const db = seed(asking([first, second], 'Bề mặt cần khoan là gì?'), { slot_ask_counts: { [first]: 1 }, address_district: 'q1' })
    await prepare(db, 'Mình không biết tường gì, nhưng kệ nặng 2kg', {
      address_district: 'q1',
      slotUnderstanding: { kind: 'unknown', slot: first, value: null, answeredSlots: [{ slot: second, value: 'nặng 2kg' }] },
    })
    expect(storedArtifact(db).facts[second], pillarWhy(PILLAR, 'the weight was said once and must not be asked again')).toBe('nặng 2kg')
  })

  it('fills nothing when the model read the reply as another topic', async () => {
    const base = fresh()
    const [first] = base.missing_facts
    const db = seed(asking([first], 'Vật cần treo nặng khoảng bao nhiêu?'), { slot_ask_counts: { [first]: 1 }, address_district: 'q1' })
    await prepare(db, 'Bên bạn có bảo hành không?', {
      address_district: 'q1',
      slotUnderstanding: { kind: 'other', slot: first, value: null, answeredSlots: [] },
    })
    expect(storedArtifact(db).facts[first], pillarWhy(PILLAR, 'a question about warranty is not a weight')).toBeUndefined()
    expect(storedArtifact(db).missing_facts).toContain(first)
  })
})

describe(`${PILLAR.id}: asks are counted`, () => {
  const clarification = (artifact: unknown, source?: string) => ({
    contentType: 'clarification' as const,
    text: 'Câu hỏi',
    nextStatus: 'active' as const,
    metadata: { diagnosis_scope: artifact, ...(source ? { clarification_source: source } : {}) },
  })

  it('counts each question once and an explanation not at all', async () => {
    const db = seed(null)
    await appendKaelSystemTurn(db.client as never, SESSION_ID, clarification(asking(['address_district'])))
    await appendKaelSystemTurn(db.client as never, SESSION_ID, clarification(asking(['address_district'])))
    await appendKaelSystemTurn(db.client as never, SESSION_ID, clarification(asking(['address_district']), 'deterministic_explanation'))
    expect(db.tables.kael_chat_sessions[0].safe_metadata, pillarWhy(PILLAR, 'the loop breaker reads these counts')).toMatchObject({
      slot_ask_counts: { address_district: 2 },
    })
  })
})

describe(`${PILLAR.id}: reading the reply`, () => {
  const reply = (body: Record<string, unknown>) => async () => ({
    success: true as const,
    content: JSON.stringify(body),
    latencyMs: 40,
    usage: { costUsd: 0.0002, inputTokens: 10, outputTokens: 10 },
    provider: 'deepseek' as const,
    model: 'deepseek-v4-flash',
  })

  function classify(body: Record<string, unknown>, pendingSlot = 'wall_surface_or_substrate') {
    return classifyCaseTurnIntent({
      actorId: 'customer-1',
      hasLinkedJob: false,
      language: 'vi',
      message: 'tường gạch, nặng 2kg',
      pendingSlot: { slot: pendingSlot, question: 'Bề mặt cần khoan là gì?' },
      openSlots: ['item_weight'],
      recentTurns: [],
      state: { casePhase: 'analysis', quoteReadiness: null, missingFacts: [pendingSlot, 'item_weight'], hasEstimate: false, quoteMode: null },
      client: memoryDb().client as never,
      secrets: {} as never,
      invoke: reply(body) as never,
    })
  }

  it('returns the answer, its value, and other open details the message covers', async () => {
    const result = await classify({
      intent: 'provide_information',
      confidence: 0.9,
      pending_slot_answer: { kind: 'answered', slot: 'wall_surface_or_substrate', value: 'tường gạch', confidence: 0.9 },
      answered_slots: [{ slot: 'item_weight', value: 'nặng 2kg' }, { slot: 'not_a_listed_slot', value: 'x' }],
    })
    expect(result.slotUnderstanding, pillarWhy(PILLAR, 'only listed open slots are accepted')).toEqual({
      kind: 'answered',
      slot: 'wall_surface_or_substrate',
      value: 'tường gạch',
      answeredSlots: [{ slot: 'item_weight', value: 'nặng 2kg' }],
    })
    expect(result.telemetry).toMatchObject({ provider: 'deepseek', model: 'deepseek-v4-flash', latencyMs: 40 })
  })

  it('ignores a low-confidence reading and an answer without a value', async () => {
    expect((await classify({
      intent: 'provide_information',
      confidence: 0.9,
      pending_slot_answer: { kind: 'unknown', slot: 'wall_surface_or_substrate', value: null, confidence: 0.4 },
    })).slotUnderstanding).toBeUndefined()
    expect((await classify({
      intent: 'provide_information',
      confidence: 0.9,
      pending_slot_answer: { kind: 'answered', slot: 'wall_surface_or_substrate', value: null, confidence: 0.9 },
    })).slotUnderstanding).toMatchObject({ kind: 'other', value: null })
  })

  it('rejects unknown fields so a drifting model cannot smuggle data in', async () => {
    const result = await classify({ intent: 'provide_information', confidence: 0.9, price_vnd: 300000 })
    expect(result.fallbackUsed).toBe(true)
    expect(result.slotUnderstanding).toBeUndefined()
  })
})
