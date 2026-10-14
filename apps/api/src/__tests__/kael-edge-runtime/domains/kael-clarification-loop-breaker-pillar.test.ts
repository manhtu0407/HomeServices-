import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { memoryDb } from '../harness/memory-db'
import { buildInitialDiagnosisScopeArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael'
import { prepareKaelChatPrePipeline } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/branches-pre-pipeline'
import { diagnosisScopeWithQuestion } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-work-artifact'
import {
  CLARIFICATION_REPEAT_LIMIT,
  handleKaelPipelineClarification,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/clarification.service'

export const PILLAR = {
  id: 'P386-kael-clarification-loop-breaker',
  invariant:
    'Kael asks for the same detail at most twice: after that it records the detail as needing on-site verification, through the path an "I do not know" answer already takes, instead of asking a third time',
  authority: [
    'governance/RULES.md #8 (an unanswered detail is marked unverified, never guessed)',
    'governance/RULES.md #7 (no flow step is added: the existing on-site verification escalation is reused)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/clarification.service.ts',
  layer: 'unit',
  siblings: ['P385-kael-turn-understanding'],
  mutation:
    'raise CLARIFICATION_REPEAT_LIMIT to 99 — the third-ask cases turn red; read the count from the wrong key — the district case turns red; stop counting asks in appendKaelSystemTurn — the second-ask case never reaches the limit and turns red',
} as const satisfies PillarManifest

const SESSION_ID = 'session-loop'
const DISTRICT_QUESTION = 'Bạn cho Kael biết quận ở TP.HCM để ước tính đúng khu vực và tìm thợ phù hợp.'

function seed(artifact: unknown, askCounts: Record<string, number>) {
  return memoryDb({
    kael_chat_sessions: [{
      id: SESSION_ID,
      customer_id: 'customer-1',
      service_type: 'handyman',
      status: 'active',
      case_phase: 'analysis',
      total_turns: 3,
      total_cost_usd: 0,
      job_id: null,
      diagnosis_scope: artifact,
      safe_metadata: { language: 'vi', slot_ask_counts: askCounts },
    }],
    kael_chat_turns: [],
  })
}

const progressTarget = { table: 'kael_chat_sessions', id: SESSION_ID } as const
const base = () => buildInitialDiagnosisScopeArtifact({ serviceType: 'handyman', customerGoal: 'lắp kệ' })
const districtArtifact = () => diagnosisScopeWithQuestion(base(), ['address_district'], DISTRICT_QUESTION, 0.25)
const kaelTurns = (db: ReturnType<typeof memoryDb>) => db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael')

function prepare(db: ReturnType<typeof memoryDb>, askCounts: Record<string, number>) {
  return prepareKaelChatPrePipeline({
    client: db.client as never,
    sessionId: SESSION_ID,
    actorId: 'customer-1',
    message: 'ở gần chợ thôi',
    serviceType: 'handyman',
    safeCustomerEvidence: 'ở gần chợ thôi',
    durableCustomerDetail: 'ở gần chợ thôi',
    problemChips: [],
    language: 'vi',
    earlySafetySignals: [],
    progressTarget,
    llmClarificationEnabled: true,
  } as never).then((result) => ({ result, askCounts }))
}

describe(`${PILLAR.id}: a third ask becomes on-site verification`, () => {
  it('asks the district a second time, and counts it', async () => {
    const db = seed(districtArtifact(), { address_district: 1 })
    const { result } = await prepare(db, { address_district: 1 })
    expect(result.handled).toBe(true)
    expect(kaelTurns(db)[0]?.text_content).toContain('quận')
    expect(db.tables.kael_chat_sessions[0].safe_metadata).toMatchObject({ slot_ask_counts: { address_district: 2 } })
  })

  it('does not ask the district a third time', async () => {
    expect(CLARIFICATION_REPEAT_LIMIT).toBe(2)
    const db = seed(districtArtifact(), { address_district: 2 })
    const { result } = await prepare(db, { address_district: 2 })
    expect(result.handled).toBe(true)
    const reply = kaelTurns(db)[0]
    expect(reply?.safe_metadata, pillarWhy(PILLAR, 'a third identical question is the dead end')).toMatchObject({
      clarification_source: 'deterministic_loop_break',
    })
    expect(reply?.text_content).toContain('xác minh tại chỗ')
    expect(reply?.text_content).not.toContain('Bạn cho Kael biết quận')
    const stored = db.tables.kael_chat_sessions[0].diagnosis_scope as { next_action: { kind: string }; quote_blockers: string[] }
    expect(stored.next_action.kind).toBe('escalate')
    expect(stored.quote_blockers).toContain('onsite_inspection_required')
    expect(db.tables.kael_chat_sessions[0].safe_metadata).toMatchObject({ slot_ask_counts: { address_district: 2 } })
  })

  it('applies the same limit to a model-written clarification', async () => {
    const slot = 'wall_surface_or_substrate'
    const db = seed(base(), { [slot]: 2 })
    await handleKaelPipelineClarification({
      client: db.client as never,
      sessionId: SESSION_ID,
      actorId: 'customer-1',
      pipeline: {
        success: false,
        code: 'NEEDS_CLARIFICATION',
        error: 'x',
        stageLogs: [],
        clarification: { question: 'Bề mặt cần khoan là gì?', missingSlots: [slot] },
      } as never,
      artifact: base(),
      customerAnalysisDetail: 'không rõ',
      language: 'vi',
      responseSafetySignals: [],
      progressTarget,
      slotAskCounts: { [slot]: 2 },
    })
    expect(kaelTurns(db)[0]?.safe_metadata, pillarWhy(PILLAR, 'the pipeline path asks too')).toMatchObject({
      clarification_source: 'deterministic_loop_break',
    })
  })

  it('still asks a model-written clarification the first and second time', async () => {
    const slot = 'wall_surface_or_substrate'
    const db = seed(base(), { [slot]: 1 })
    await handleKaelPipelineClarification({
      client: db.client as never,
      sessionId: SESSION_ID,
      actorId: 'customer-1',
      pipeline: {
        success: false,
        code: 'NEEDS_CLARIFICATION',
        error: 'x',
        stageLogs: [],
        clarification: { question: 'Bề mặt cần khoan là bê tông hay gạch?', missingSlots: [slot] },
      } as never,
      artifact: base(),
      customerAnalysisDetail: 'không rõ',
      language: 'vi',
      responseSafetySignals: [],
      progressTarget,
      slotAskCounts: { [slot]: 1 },
    })
    expect(kaelTurns(db)[0]?.safe_metadata).toMatchObject({ clarification_source: 'ai' })
    expect(db.tables.kael_chat_sessions[0].safe_metadata).toMatchObject({ slot_ask_counts: { [slot]: 2 } })
  })
})
