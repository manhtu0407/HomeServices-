import { vi } from 'vitest'

import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { buildInitialDiagnosisScopeArtifact, buildPriceEvidenceUnavailableArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael/index'
import { emitEvidenceGapStep } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/evidence-gap-response'
import { diagnosisScopeWithGroundedAnswer } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-work-artifact'
import { diagnosisScopeWithQuestion } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/case-work-artifact'
import { memoryDb, type MemoryDb } from './memory-db'
import { scriptedProviderFetch, type ProviderCall, type ProviderReply, type ProviderRequestBody } from './scripted-provider'

// A synthetic Customer Case driven through the real HTTP handler, the real services and the real
// classifier, permission gate, Case context and serializer. The only things replaced are the places
// where the code would leave the process: the model providers (via `fetch`) and the database (an
// in-memory PostgREST stand-in). Nothing here fabricates an intent or a permission decision.

export const CASE_SESSION_ID = '39800000-0000-4000-8000-000000000001'
export const CASE_OWNER_ID = '39800000-0000-4000-8000-0000000000a1'
export const CASE_STRANGER_ID = '39800000-0000-4000-8000-0000000000b2'
export const CASE_ADMIN_ID = '39800000-0000-4000-8000-0000000000c3'
export const HVAC_UNIT_SLOT = 'unit_type_count_and_capacity'
export const HVAC_SYMPTOM_SLOT = 'symptom_and_operating_condition'
export const HVAC_UNIT_QUESTION = 'Máy treo tường hay âm trần, mấy bộ, công suất khoảng bao nhiêu HP?'

const SYNTHETIC_TIME = '2026-10-20T01:00:00.000Z'

export type Actor = { id: string; role: 'customer' | 'worker' | 'admin' }
export const OWNER: Actor = { id: CASE_OWNER_ID, role: 'customer' }
export const STRANGER: Actor = { id: CASE_STRANGER_ID, role: 'customer' }

// What a model call looked like, as far as a scenario needs to branch on it.
export type ModelCall = { purpose: string; provider: ProviderCall['provider']; body: ProviderRequestBody; userContent: string }
export type ModelReplyFn = (call: ModelCall) => ProviderReply

export type ClassifierJson = {
  intent: string
  confidence: number
  pending_slot_answer?: { kind: string; slot: string | null; value: string | null; confidence: number } | null
  answered_slots?: Array<{ slot: string; value: string }>
}

export type CaseWorldOptions = {
  service?: string
  // A seeded diagnosis_scope; defaults to an HVAC Case asking for the unit slot.
  artifact?: unknown
  district?: string | null
  status?: string
  casePhase?: string
  // Extra earlier turns that never name the service, to push the unit question out of the recent-turn window.
  filler?: number
  policies?: { problems?: Array<Record<string, unknown>>; intake?: Array<Record<string, unknown>> }
  model?: ModelReplyFn
  secrets?: Record<string, unknown>
  // Runtime flags the Edge code reads through Deno.env. The HVAC playbook gates the deterministic safety path.
  env?: Record<string, string>
  hvacPlaybook?: boolean
  problemChips?: string[]
}

export function purposeOf(body: ProviderRequestBody): string {
  const system = JSON.stringify(body.messages ?? [])
  return /purpose=([a-z_0-9]+)/.exec(system)?.[1] ?? 'unknown'
}

function lastUserContent(body: ProviderRequestBody): string {
  const messages = (body.messages ?? []) as Array<{ role?: string; content?: unknown }>
  const user = [...messages].reverse().find((message) => message.role === 'user')
  return typeof user?.content === 'string' ? user.content : JSON.stringify(user?.content ?? '')
}

export const HVAC_PROBLEM_ID = '39800000-0000-4000-8000-0000000000d1'

// A grounded HVAC problem with an active intake policy. `rfq` decides whether a worker quote may stand in for a price Kael cannot validate.
export function hvacPolicyRows(options: { rfq: boolean }) {
  return {
    problems: [{ id: HVAC_PROBLEM_ID, slug: 'other_hvac', label_vi: 'Vấn đề điều hòa khác', service_type: 'hvac', is_active: true }],
    intake: [{
      id: '39800000-0000-4000-8000-0000000000d2',
      version: 1,
      service_problem_id: HVAC_PROBLEM_ID,
      status: 'active',
      quote_mode: 'kael_auto_quote',
      tier_a_fields: ['service_type', 'problem_slug', 'address_district', 'address_label', 'description_min'],
      tier_b_slots: [
        { key: HVAC_UNIT_SLOT, enabled: true, required_for_quote: false },
        { key: HVAC_SYMPTOM_SLOT, enabled: true, required_for_quote: false },
      ],
      question_overrides: {},
      safety_requirements: [],
      capability_requirements: [],
      evidence_requirements: {
        minimum_source_count: 2,
        minimum_high_trust_source_count: 2,
        requires_active_baseline: false,
        allow_live_market_evidence: true,
        ...(options.rfq ? { evidence_unavailable_fallback: 'rfq' } : {}),
      },
    }],
  }
}

export function hvacPendingUnitArtifact() {
  return diagnosisScopeWithQuestion(
    buildInitialDiagnosisScopeArtifact({ serviceType: 'hvac', customerGoal: 'Vệ sinh hai máy lạnh' }),
    [HVAC_UNIT_SLOT, HVAC_SYMPTOM_SLOT],
    HVAC_UNIT_QUESTION,
    0.4,
  )
}

export const classifierReply = (json: ClassifierJson): ProviderReply => ({ content: JSON.stringify(json) })

export const unitAnswered = (value: string): ClassifierJson['pending_slot_answer'] => ({
  kind: 'answered',
  slot: HVAC_UNIT_SLOT,
  value,
  confidence: 0.9,
})

// Failure shapes a provider can take at the transport boundary.
export const providerDown: ProviderReply = { status: 503, error: { message: 'upstream unavailable' } }
export const providerMalformed: ProviderReply = { content: '{"intent": ' }
export const providerWrongShape: ProviderReply = { content: JSON.stringify({ intent: 'provide_information_and_more', confidence: 'high' }) }

export function networkFailure(name: 'AbortError' | 'TimeoutError' | 'TypeError'): never {
  const error = new Error(name === 'TypeError' ? 'fetch failed' : 'The operation was aborted due to timeout')
  error.name = name
  throw error
}

export const EXPLANATION_ANSWER = 'Kael cần số máy, loại máy và công suất để rà soát đúng yêu cầu của bạn trước khi báo giá.'

export function assistantReply(answer = EXPLANATION_ANSWER): ProviderReply {
  return { content: JSON.stringify({ answer, public_reasoning_summary: ['Dựa trên yêu cầu đang mở của bạn.'], service_intent: null }) }
}

// Every stage the pipeline reaches after the classifier finds no price evidence: the providers answer "nothing".
const EMPTY_MARKET: ProviderReply = { content: '{}' }

export function createCaseWorld(options: CaseWorldOptions = {}) {
  const service = options.service ?? 'hvac'
  const artifact = options.artifact === undefined ? hvacPendingUnitArtifact() : options.artifact
  const district = options.district === undefined ? 'Quận 7' : options.district
  const baseTurns: Array<{ role: 'customer' | 'kael'; text: string }> = [
    { role: 'customer', text: 'Mình cần vệ sinh máy lạnh trong nhà.' },
    { role: 'kael', text: HVAC_UNIT_QUESTION },
    ...Array.from({ length: options.filler ?? 0 }, (_, index) => ({
      role: index % 2 === 0 ? ('customer' as const) : ('kael' as const),
      text: index % 2 === 0 ? `Nhà mình ở tầng ${index + 3}, có thang máy.` : `Kael ghi nhận chi tiết số ${index + 1}.`,
    })),
  ]
  const turnRows = baseTurns.map((turn, index) => ({
    id: `39800000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
    session_id: CASE_SESSION_ID,
    turn_index: index + 1,
    role: turn.role,
    content_type: turn.role === 'kael' ? 'clarification' : 'text',
    text_content: turn.text,
    media_refs: [],
    safe_metadata: {},
    created_at: SYNTHETIC_TIME,
  }))
  const db: MemoryDb = memoryDb({
    kael_chat_sessions: [{
      id: CASE_SESSION_ID,
      customer_id: CASE_OWNER_ID,
      job_id: null,
      service_type: service,
      status: options.status ?? 'active',
      case_phase: options.casePhase ?? 'analysis',
      total_turns: turnRows.length,
      total_cost_usd: 0,
      diagnosis_scope: artifact,
      started_at: SYNTHETIC_TIME,
      created_at: SYNTHETIC_TIME,
      estimate_ready_at: null,
      scheduled_at: null,
      safe_metadata: {
        language: 'vi',
        ...(district ? { address_district: district, address_label: 'Căn hộ thử nghiệm' } : {}),
        ...(options.problemChips ? { problem_chips: options.problemChips } : {}),
        slot_ask_counts: { [HVAC_UNIT_SLOT]: 1 },
      },
    }],
    kael_chat_turns: turnRows,
    service_problems: options.policies?.problems ?? [],
    service_intake_policies: options.policies?.intake ?? [],
  }, { isolateReads: true })

  // Mirrors a deployed Edge isolate: an unpriced model is metered at the safe-high rate instead of throwing.
  const env: Record<string, string> = {
    KAEL_AUTONOMY_FULL_ENABLED: 'true',
    DENO_DEPLOYMENT_ID: 'synthetic-deployment',
    ...(options.hvacPlaybook ? { KAEL_PLAYBOOK_HVAC_ENABLED: 'true' } : {}),
    ...options.env,
  }
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } })

  const modelCalls: ModelCall[] = []
  const respond = (provider: ProviderCall['provider']) => (body: ProviderRequestBody): ProviderReply => {
    const call: ModelCall = { purpose: purposeOf(body), provider, body, userContent: lastUserContent(body) }
    modelCalls.push(call)
    if (options.model) return options.model(call)
    return provider === 'deepseek' && call.purpose === 'case_turn_intent' ? providerDown : EMPTY_MARKET
  }
  const provider = scriptedProviderFetch({
    anthropic: respond('anthropic'),
    deepseek: respond('deepseek'),
    perplexity: respond('perplexity'),
  })
  vi.stubGlobal('fetch', provider.fetch)

  const services = createEdgeServices({
    deepseekApiKey: 'synthetic-deepseek-key',
    anthropicApiKey: 'synthetic-anthropic-key',
    perplexityApiKey: 'synthetic-perplexity-key',
    knowledgeRetrievalEnabled: false,
    ...options.secrets,
  } as never)

  async function send(
    message: string,
    sendOptions: { as?: Actor; chip?: string; language?: 'vi' | 'en'; path?: string } = {},
  ) {
    const actor = sendOptions.as ?? OWNER
    const handler = createMobileApiHandler({
      authenticate: async () => ({
        success: true as const,
        user: { id: actor.id },
        role: actor.role,
        supabase: db.client,
        privilegedSupabase: db.client,
        userSupabase: db.client,
      }) as never,
      services,
    })
    const before = modelCalls.length
    const turnsBefore = db.tables.kael_chat_turns.length
    const response = await handler(new Request(`https://edge.test/mobile-api/kael/chat/${CASE_SESSION_ID}${sendOptions.path ?? ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message,
        language: sendOptions.language ?? 'vi',
        ...(sendOptions.chip ? { turn_intent: sendOptions.chip } : {}),
      }),
    }))
    const body = await response.json() as Record<string, any>
    return {
      status: response.status,
      body,
      calls: modelCalls.slice(before),
      purposes: modelCalls.slice(before).map((call) => `${call.provider}:${call.purpose}`),
      newTurns: db.tables.kael_chat_turns.slice(turnsBefore),
    }
  }

  const session = () => db.tables.kael_chat_sessions[0] as Record<string, any>
  const scope = () => session().diagnosis_scope as Record<string, any>
  const kaelTurns = () => db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael')

  // Tables a clarification, explanation or price-gap turn may legitimately write. Anything else - a Job,
  // a payment, a matching candidate, a price estimate - means a workflow gate was crossed.
  const ALLOWED_WRITES = new Set([
    'kael_chat_sessions',
    'kael_chat_turns',
    'api_logs',
    'kael_optimization_metrics',
    'kael_price_knowledge',
    'kael_case_knowledge',
    'kael_guardrail_trip_audit',
  ])
  const unexpectedWrites = () => Object.entries(db.tables)
    .filter(([name, rows]) => rows.length > 0 && !ALLOWED_WRITES.has(name) && name !== 'service_problems' && name !== 'service_intake_policies')
    .map(([name, rows]) => `${name}=${rows.length}`)

  // Puts the Case in the state the pipeline leaves it in after a price lookup finds no validated source,
  // using the same emitter the server uses, so the persisted artifact, turn and metadata are the real ones.
  async function seedPriceEvidenceGap(unitAnswer = '2 máy treo tường 1HP.') {
    const answered = diagnosisScopeWithGroundedAnswer(session().diagnosis_scope as never, HVAC_UNIT_SLOT, unitAnswer)
    const unavailable = buildPriceEvidenceUnavailableArtifact(answered as never, {
      customerDetail: unitAnswer,
      scopeSummary: 'Vệ sinh hai máy lạnh treo tường 1HP.',
    })
    await emitEvidenceGapStep({
      client: db.client as never,
      sessionId: CASE_SESSION_ID,
      progressTarget: { table: 'kael_chat_sessions', id: CASE_SESSION_ID },
      artifact: unavailable,
      stageLogs: [{
        stage: 'market',
        latencyMs: 900,
        success: false,
        fallbackUsed: true,
        safeMetadata: { source_trust_aggregation_result: 'insufficient_tier_1_2_quorum', source_trust_tier_1_2_count: 0 },
      }],
      language: 'vi',
      responseSafetySignals: [],
      serviceProblemId: HVAC_PROBLEM_ID,
      extraMetadata: { stage1_runtime_behavior: 'governed', fallback_used: true },
    })
  }

  return {
    db,
    services,
    seedPriceEvidenceGap,
    provider,
    modelCalls,
    send,
    session,
    scope,
    kaelTurns,
    unexpectedWrites,
  }
}

export type CaseWorld = ReturnType<typeof createCaseWorld>
