import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { memoryDb } from '../harness/memory-db'

export const PILLAR = {
  id: 'P394-kael-turn-trace',
  invariant:
    'a refused or redirected Kael turn can be mapped to its route, failure stage, permission reason, canonical service and release identity from a bounded, allow-listed trace; the trace carries no message text, is optional for legacy clients, and never changes what the customer is told or what the case may do',
  authority: [
    'governance/RULES.md #9 (logs carry ids, codes and safe metadata only, never raw chat text or PII)',
    'governance/RULES.md #8 (a fallback is marked internally; telemetry failure is never a fake success)',
    'governance/RULES.md #6 (genuinely unsupported services are still declined)',
  ],
  target: 'supabase/functions/mobile-api/_shared/platform/turn-trace.ts',
  layer: 'security-negative',
  siblings: ['P382-kael-turn-telemetry', 'P311-customer-normal-chat-topic-gate'],
  mutation:
    'rethrow instead of returning null in caseTurnTrace — the throwing-identity case turns red; stop forwarding the permission decision from runCustomerAssistant — the permission-reason case turns red; let any string through as permission_reason in buildKaelTurnTrace — the free-text drop case turns red',
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
import { canonicalReplyComposer } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/reply-composer'
import {
  buildKaelTurnTrace,
  logKaelTurnTrace,
  KAEL_TURN_TRACE_KEYS,
} from '../../../../../../supabase/functions/mobile-api/_shared/platform/turn-trace'
import { __resetRateLimitStoreForTests } from '../../../../../../supabase/functions/mobile-api/_shared/platform/rate-limit'
import { traceAssistantTurn } from '../../../../../../supabase/functions/mobile-api/_shared/kael/agents/customer-assistant-trace'
import { runCustomerAssistant } from '../../../../../../supabase/functions/mobile-api/_shared/kael/agents/customer-assistant'

const SESSION_ID = 'session-trace'
const TRACE_ID = '0b8e6a52-3f0d-4d0e-9c43-7a5a1f4c2e10'
const RELEASE_ID = 'harness-0123456789ab-fedcba987654'
const DEPLOYMENT_ID = 'iwevizmsedyqozxlawwl_5e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b_297'
const GIT_SHA = 'a06afacef09420e5678fa928db1b23b088b954e4'
const EAS_BUILD_ID = '7d3c1f0e-8b2a-4c6d-9e5f-1a2b3c4d5e6f'

const FULL_IDENTITY = {
  traceId: TRACE_ID,
  releaseId: RELEASE_ID,
  deploymentId: DEPLOYMENT_ID,
  clientPlatform: 'ios',
  clientBuildNumber: 57,
  clientEasBuildId: EAS_BUILD_ID,
  clientGitSha: GIT_SHA,
  clientReleaseId: RELEASE_ID,
} as const

const SECRET_TEXT = 'Tại sao chưa đủ dữ kiện? Số của mình 0901234567, nhà 12 Nguyễn Huệ, mail an@example.com'

function seed(serviceType: string | null = 'hvac') {
  const original = {
    id: SESSION_ID,
    customer_id: 'customer-1',
    service_type: serviceType,
    status: 'active',
    case_phase: 'analysis',
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
    jobs: [],
    job_payment_orders: [],
  })
  return { db, original }
}

function route(
  db: ReturnType<typeof memoryDb>,
  original: Record<string, unknown>,
  ctx: Record<string, unknown>,
  message = SECRET_TEXT,
  rawCtx?: unknown,
) {
  return routeKaelChatTurnIntent({
    ctx: (rawCtx ?? { success: true, user: { id: 'customer-1' }, role: 'customer', ...ctx }) as never,
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

const REFUSAL_DECISION = {
  stage: 'permission_gate',
  topic: 'out_of_scope_services_anything',
  reason_code: 'DENY_OUT_OF_SCOPE_SERVICE',
  topic_source: 'deterministic_rule',
  service_resolved: null,
} as const

function answerRefused() {
  hooks.classify.mockResolvedValue({ intent: 'ask_question', confidence: 0.9, fallbackUsed: false })
  hooks.answer.mockResolvedValue({
    answer: 'Kael xin lỗi, hạng mục này ngoài sáu dịch vụ đang hỗ trợ.',
    safety_notes: [],
    fallback_used: true,
    boundary: 'unsupported',
    decision: REFUSAL_DECISION,
    trace: [],
  })
}

function replyOf(db: ReturnType<typeof memoryDb>) {
  return db.tables.kael_chat_turns.find((turn) => turn.role === 'kael')
}

beforeEach(() => {
  __resetRateLimitStoreForTests()
})

afterEach(() => {
  hooks.classify.mockReset()
  hooks.answer.mockReset()
  vi.restoreAllMocks()
})

describe(`${PILLAR.id}: a bounded trace maps a refusal to a stage and a release`, () => {
  it('records route, stage, permission reason, canonical service, intent and release identity on the reply turn', async () => {
    answerRefused()
    const { db, original } = seed('hvac')
    await route(db, original, FULL_IDENTITY)
    const trace = (replyOf(db)?.safe_metadata as Record<string, unknown>).turn_trace
    expect(trace, pillarWhy(PILLAR, 'the refusal must be attributable without reading chat text')).toEqual({
      schema: 'kael_turn_trace.v1',
      correlation_id: TRACE_ID,
      route: 'case_work_question',
      stage: 'permission_gate',
      outcome: 'unsupported',
      fallback_used: true,
      service_code: 'hvac',
      assistant_service_code: 'none',
      case_phase: 'analysis',
      intent: 'ask_question',
      intent_source: 'ai',
      permission_reason: 'DENY_OUT_OF_SCOPE_SERVICE',
      permission_topic: 'out_of_scope_services_anything',
      topic_source: 'deterministic_rule',
      replay_topic: 'hvac_service',
      edge_release_id: RELEASE_ID,
      edge_deployment_id: DEPLOYMENT_ID,
      client_release_id: RELEASE_ID,
      client_git_sha: GIT_SHA,
      client_build_number: 57,
      client_eas_build_id: EAS_BUILD_ID,
      client_platform: 'ios',
    })
  })

  it('keeps a real unsupported request distinguishable from a context-loss fallback', async () => {
    answerRefused()
    const hvacCase = seed('hvac')
    await route(hvacCase.db, hvacCase.original, FULL_IDENTITY, 'Tại sao chưa đủ dữ kiện?')
    const contextLoss = (replyOf(hvacCase.db)?.safe_metadata as Record<string, any>).turn_trace

    answerRefused()
    const genuine = seed('hvac')
    await route(genuine.db, genuine.original, FULL_IDENTITY, 'Sửa tủ lạnh giúp mình')
    const unsupported = (replyOf(genuine.db)?.safe_metadata as Record<string, any>).turn_trace

    expect(contextLoss.replay_topic, pillarWhy(PILLAR, 'with the canonical service supplied, a context-loss refusal is no longer a refusal')).toBe('hvac_service')
    expect(unsupported.replay_topic, pillarWhy(PILLAR, 'a real unsupported request is refused even with the canonical service')).toBe('out_of_scope_services_anything')
    expect(unsupported).not.toEqual(contextLoss)
  })

  it('marks a model-declared scope refusal as provider output, not as an answered turn', async () => {
    hooks.classify.mockResolvedValue({ intent: 'ask_question', confidence: 0.9, fallbackUsed: false })
    hooks.answer.mockResolvedValue({ answer: 'Ngoài phạm vi.', safety_notes: [], fallback_used: false, boundary: 'unsupported', trace: [] })
    const { db, original } = seed('hvac')
    await route(db, original, FULL_IDENTITY, 'Tại sao chưa đủ dữ kiện?')
    const trace = (replyOf(db)?.safe_metadata as Record<string, any>).turn_trace
    expect(trace, pillarWhy(PILLAR, 'no permission reason exists, so the model wrote this refusal')).toMatchObject({ stage: 'provider_output', outcome: 'unsupported' })
    expect(trace).not.toHaveProperty('permission_reason')
  })

  it('stores the quote blocker as a closed enum and prefers the price-gap reason', async () => {
    hooks.classify.mockResolvedValue({ intent: 'ask_question', confidence: 0.9, fallbackUsed: false })
    hooks.answer.mockResolvedValue({ answer: 'Chưa có nguồn giá.', safety_notes: [], fallback_used: false, boundary: 'answered', trace: [] })
    const { db, original } = seed('hvac')
    db.tables.kael_chat_turns.push({
      id: 'gap', session_id: SESSION_ID, turn_index: 1, role: 'kael', text_content: 'x',
      safe_metadata: { quote_readiness: 'validated_price_evidence_unavailable', price_gap_reason: 'too_few_trusted_sources' },
    })
    await route(db, original, FULL_IDENTITY, 'Tại sao chưa đủ dữ kiện?')
    const trace = (db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael').at(-1)?.safe_metadata as Record<string, any>).turn_trace
    expect(trace.quote_blocker).toBe('too_few_trusted_sources')
    expect(trace.stage, pillarWhy(PILLAR, 'an answered turn is traced as answered, not as a refusal')).toBe('answered')
  })
})

describe(`${PILLAR.id}: the trace is bounded, redacted and optional`, () => {
  it('carries only allow-listed keys and never any part of the message', async () => {
    answerRefused()
    const { db, original } = seed('hvac')
    await route(db, original, FULL_IDENTITY)
    const trace = (replyOf(db)?.safe_metadata as Record<string, unknown>).turn_trace as Record<string, unknown>
    expect(Object.keys(trace).every((key) => KAEL_TURN_TRACE_KEYS.includes(key)), pillarWhy(PILLAR, `keys: ${Object.keys(trace).join(',')}`)).toBe(true)
    const serialized = JSON.stringify(trace)
    for (const fragment of ['0901234567', 'Nguyễn Huệ', 'example.com', 'dữ kiện', 'customer-1', SESSION_ID]) {
      expect(serialized, pillarWhy(PILLAR, `leaked ${fragment}`)).not.toContain(fragment)
    }
    expect(serialized.length).toBeLessThan(900)
  })

  it('drops every free-text or malformed value instead of storing it', () => {
    const hostile = 'x'.repeat(400)
    const trace = buildKaelTurnTrace({
      identity: {
        traceId: `${TRACE_ID} ${SECRET_TEXT}`,
        releaseId: SECRET_TEXT,
        deploymentId: hostile,
        clientPlatform: 'tizen',
        clientBuildNumber: -4,
        clientEasBuildId: 'not-a-uuid',
        clientGitSha: 'Bearer abcdef0123456789',
        clientReleaseId: '<script>alert(1)</script>',
      },
      route: 'case_work_question',
      stage: SECRET_TEXT,
      outcome: SECRET_TEXT,
      canonicalService: SECRET_TEXT,
      assistantService: 'sửa ống nước ở 12 Nguyễn Huệ',
      intent: SECRET_TEXT,
      intentSource: SECRET_TEXT,
      permissionReason: 'deny: số 0901234567',
      permissionTopic: SECRET_TEXT,
      topicSource: SECRET_TEXT,
      replayTopic: SECRET_TEXT,
      quoteReadiness: SECRET_TEXT,
      priceGapReason: hostile,
    } as never)
    expect(trace).toEqual({ schema: 'kael_turn_trace.v1', route: 'case_work_question', stage: 'other', service_code: 'none', assistant_service_code: 'none', quote_blocker: 'other' })
    for (const value of Object.values(trace)) expect(String(value).length).toBeLessThanOrEqual(64)
  })

  it('is optional for a legacy client and never invents the missing identity', async () => {
    answerRefused()
    const { db, original } = seed('hvac')
    await route(db, original, { traceId: TRACE_ID, releaseId: RELEASE_ID })
    const trace = (replyOf(db)?.safe_metadata as Record<string, unknown>).turn_trace as Record<string, unknown>
    expect(trace).toMatchObject({ correlation_id: TRACE_ID, edge_release_id: RELEASE_ID, service_code: 'hvac' })
    for (const key of ['client_release_id', 'client_git_sha', 'client_build_number', 'client_eas_build_id', 'client_platform', 'edge_deployment_id']) {
      expect(trace, pillarWhy(PILLAR, `legacy client has no ${key}`)).not.toHaveProperty(key)
    }
    const bare = seed('hvac')
    await route(bare.db, bare.original, {})
    expect((replyOf(bare.db)?.safe_metadata as Record<string, any>).turn_trace).toMatchObject({ schema: 'kael_turn_trace.v1', service_code: 'hvac', stage: 'permission_gate' })
  })

  it('maps an unsupported canonical service to none rather than echoing it', () => {
    expect(buildKaelTurnTrace({ route: 'case_work_question', stage: 'answered', canonicalService: 'refrigerator' } as never).service_code).toBe('none')
    expect(buildKaelTurnTrace({ route: 'case_work_question', stage: 'answered', canonicalService: 'plumbing' } as never).service_code).toBe('plumbing')
  })
})

describe(`${PILLAR.id}: tracing never changes a decision`, () => {
  it('produces the same reply, status and writes with or without any identity', async () => {
    answerRefused()
    const withIdentity = seed('hvac')
    await route(withIdentity.db, withIdentity.original, FULL_IDENTITY)
    answerRefused()
    const legacy = seed('hvac')
    await route(legacy.db, legacy.original, {})

    const strip = (db: ReturnType<typeof memoryDb>) => {
      const reply = { ...(replyOf(db) as Record<string, any>) }
      const metadata = { ...reply.safe_metadata }
      delete metadata.turn_trace
      const session = { ...db.tables.kael_chat_sessions[0] } as Record<string, any>
      const lastIntent = { ...session.safe_metadata.last_turn_intent }
      delete lastIntent.at
      delete reply.id
      delete reply.created_at
      return { reply: { ...reply, safe_metadata: metadata }, status: session.status, phase: session.case_phase, lastIntent }
    }
    expect(strip(withIdentity.db), pillarWhy(PILLAR, 'identity must not reach the customer-visible result')).toEqual(strip(legacy.db))
    for (const { db } of [withIdentity, legacy]) {
      expect(db.tables.jobs, pillarWhy(PILLAR, 'a clarification never creates a job')).toHaveLength(0)
      expect(db.tables.job_payment_orders, pillarWhy(PILLAR, 'a clarification never creates a payment')).toHaveLength(0)
    }
  })

  it('still answers the customer when the identity cannot be read', async () => {
    answerRefused()
    const { db, original } = seed('hvac')
    const hostileCtx = Object.create(
      { success: true, user: { id: 'customer-1' }, role: 'customer' },
      {
        traceId: {
          get(): string {
            throw new Error('identity unavailable')
          },
        },
      },
    )
    await route(db, original, {}, SECRET_TEXT, hostileCtx)
    const reply = replyOf(db)
    expect(reply?.text_content, pillarWhy(PILLAR, 'telemetry failure must not drop the answer')).toContain('ngoài sáu dịch vụ')
    expect(reply?.safe_metadata).not.toHaveProperty('turn_trace')
  })

  it('does not widen what the permission gate allows', async () => {
    const refused = await runCustomerAssistant({
      message: 'Tại sao chưa đủ dữ kiện?',
      surface: 'customer_case',
      serviceType: null,
      job: null,
      language: 'vi',
      secrets: {} as never,
    })
    expect(refused.boundary).toBe('unsupported')
    expect(refused.decision).toEqual({
      stage: 'permission_gate',
      topic: 'out_of_scope_services_anything',
      reason_code: 'DENY_OUT_OF_SCOPE_SERVICE',
      topic_source: 'deterministic_rule',
      service_resolved: null,
    })
    const scoped = await runCustomerAssistant({
      message: 'Tại sao chưa đủ dữ kiện?',
      surface: 'customer_case',
      serviceType: 'hvac',
      job: null,
      language: 'vi',
      secrets: {} as never,
    })
    expect(scoped.decision, pillarWhy(PILLAR, 'an allowed turn has no refusal decision')).toBeUndefined()
    const unsupported = await runCustomerAssistant({
      message: 'Sửa tủ lạnh giúp mình',
      surface: 'customer_case',
      serviceType: 'hvac',
      job: null,
      language: 'vi',
      secrets: {} as never,
    })
    expect(unsupported.decision, pillarWhy(PILLAR, 'a genuinely unsupported service stays declined')).toMatchObject({
      stage: 'permission_gate',
      reason_code: 'DENY_OUT_OF_SCOPE_SERVICE',
    })
  })
})

describe(`${PILLAR.id}: the direct assistant route is traced too`, () => {
  const refused = { boundary: 'unsupported', fallback_used: true, decision: REFUSAL_DECISION } as never

  it('logs the case-surface refusal with the canonical service and a replay that exposes context loss', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    traceAssistantTurn('assistant_case', FULL_IDENTITY, refused, { message: 'Tại sao chưa đủ dữ kiện?', canonicalService: 'hvac', surface: 'customer_case' })
    expect(warn, pillarWhy(PILLAR, 'the route that has no stored turn must still leave one line')).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toBe('kael_turn_trace')
    expect(warn.mock.calls[0][1]).toMatchObject({
      route: 'assistant_case',
      stage: 'permission_gate',
      service_code: 'hvac',
      assistant_service_code: 'none',
      permission_reason: 'DENY_OUT_OF_SCOPE_SERVICE',
      replay_topic: 'hvac_service',
      edge_release_id: RELEASE_ID,
    })
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain('dữ kiện')
  })

  it('keeps a real unsupported request visibly unsupported after the replay', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    traceAssistantTurn('assistant_case', FULL_IDENTITY, refused, { message: 'Sửa tủ lạnh giúp mình', canonicalService: 'hvac', surface: 'customer_case' })
    expect(warn.mock.calls[0][1]).toMatchObject({ replay_topic: 'out_of_scope_services_anything' })
  })

  it('never throws into the customer turn, even for a hostile identity', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const hostile = Object.create({}, { releaseId: { get(): string { throw new Error('boom') } } })
    expect(() => traceAssistantTurn('assistant_case', hostile, refused, { message: 'x', canonicalService: 'hvac', surface: 'customer_case' })).not.toThrow()
  })
})

describe(`${PILLAR.id}: the log line is rate limited and carries no text`, () => {
  it('logs a refusal once per bucket allowance and never logs an answered turn', () => {
    const lines: unknown[][] = []
    const write = (...args: unknown[]) => void lines.push(args)
    const refused = buildKaelTurnTrace({ route: 'case_work_question', stage: 'permission_gate', permissionReason: 'DENY_OUT_OF_SCOPE_SERVICE' } as never)
    const answered = buildKaelTurnTrace({ route: 'case_work_question', stage: 'answered' } as never)
    const written = Array.from({ length: 40 }, () => logKaelTurnTrace(refused, write)).filter(Boolean).length
    expect(written, pillarWhy(PILLAR, 'a burst of identical refusals must be capped')).toBeGreaterThan(0)
    expect(written).toBeLessThan(40)
    expect(lines).toHaveLength(written)
    expect(logKaelTurnTrace(answered, write)).toBe(false)
    expect(lines.length).toBe(written)
    expect(lines[0][0]).toBe('kael_turn_trace')
    expect(JSON.stringify(lines[0])).not.toContain('dữ kiện')
    const other = buildKaelTurnTrace({ route: 'assistant_case', stage: 'permission_gate' } as never)
    expect(logKaelTurnTrace(other, write), pillarWhy(PILLAR, 'another route has its own allowance')).toBe(true)
  })
})
