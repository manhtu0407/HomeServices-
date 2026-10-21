import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { vi } from 'vitest'

import { buildInitialDiagnosisScopeArtifact } from '../../../../../../supabase/functions/mobile-api/_shared/kael/index'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { CASE_SESSION_ID, OWNER, createCaseWorld, type CaseWorld } from '../harness'

export const HARNESS_VERSION = 'kawa-diag-harness.v1.1'

export type Actor = { id: string; role: 'customer' | 'worker' | 'admin' }
export const ADMIN: Actor = { id: '39800000-0000-4000-8000-0000000000c3', role: 'admin' }
export const WORKER: Actor = { id: '39800000-0000-4000-8000-0000000000e5', role: 'worker' }

export type Step = {
  id: string
  op: 'create' | 'turn' | 'create_existing'
  message?: string
  voice_transcript?: string
  text_note?: string
  language: 'vi' | 'en'
  address_district?: string
  turn_intent?: string
  scheduled_at?: string
  schedule_window?: Record<string, unknown>
  hazard: boolean
  expects_question?: boolean
  route?: string
  also_accept_routes?: string[]
  expect_status?: '2xx' | 'any'
  closed?: boolean
  faulted?: boolean
  retry?: boolean
}
export type WorldSpec = { kind: 'new_case' | 'active_case' | 'closed_case'; status?: string; fault?: { fail_next_kael_reply_inserts?: number } }
export type Scenario = {
  id: string
  service: string
  class: string
  kind?: string
  world?: WorldSpec
  variants?: Array<{ id: string; world: WorldSpec }>
  steps?: Step[]
  gating: string[]
}
export type Matrix = {
  route_policy: { required_numbers: Record<string, string[]> }
  allowed_business_writes: { tables: string[] }
  assertions: Record<string, string>
  scenarios: Scenario[]
  journey_definitions: { standard: { checkpoints: Array<{ id: string; name: string; expected: string }> } }
}

export function loadMatrix(): { matrix: Matrix; sha256: string } {
  const path = process.env.KAWA_DIAG_MATRIX
  const expected = process.env.KAWA_DIAG_MATRIX_SHA
  if (!path || !expected) throw new Error('KAWA_DIAG_MATRIX and KAWA_DIAG_MATRIX_SHA are required')
  const raw = readFileSync(path)
  const sha256 = createHash('sha256').update(raw).digest('hex')
  if (sha256 !== expected) throw new Error(`frozen matrix hash mismatch: ${sha256} != ${expected}`)
  return { matrix: JSON.parse(raw.toString('utf8')) as Matrix, sha256 }
}

const classifierModel = (call: { purpose: string }) =>
  call.purpose === 'case_turn_intent'
    ? { content: JSON.stringify({ intent: 'provide_information', confidence: 0.9 }) }
    : { content: '{}' }

function errorChain(error: { code: string; message: string }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    single: () => chain,
    maybeSingle: () => chain,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error }).then(resolve),
  }
  return chain
}

const inert: unknown = new Proxy(function () {}, {
  get: (_target, property) => property === 'then'
    ? (resolve: (value: unknown) => unknown) => Promise.resolve({ data: { id: 'conversation-stub' }, error: null }).then(resolve)
    : () => inert,
  apply: () => inert,
})

export type Instrumented = {
  world: CaseWorld
  rpcCalls: string[]
  console: Array<{ level: string; text: string }>
  restore: () => void
}

export function buildWorld(service: string, spec: WorldSpec): Instrumented {
  const consoleLines: Array<{ level: string; text: string }> = []
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      const text = args.map((arg) => {
        if (typeof arg === 'string') return arg
        if (arg instanceof Error) return `${arg.name}: ${arg.message}`
        try { return JSON.stringify(arg) } catch { return String(arg) }
      }).join(' ')
      consoleLines.push({ level, text })
    }))

  const world = createCaseWorld({
    service,
    artifact: buildInitialDiagnosisScopeArtifact({ serviceType: service as never, customerGoal: 'Cần hỗ trợ' }),
    status: spec.kind === 'closed_case' ? spec.status : undefined,
    model: classifierModel as never,
    env: process.env.KAWA_DIAG_PLAYBOOK_FLAGS === 'on'
      ? Object.fromEntries(['ELECTRICAL', 'PLUMBING', 'CLEANING', 'HVAC', 'UPHOLSTERY', 'HANDYMAN'].map((name) => [`KAEL_PLAYBOOK_${name}_ENABLED`, 'true']))
      : undefined,
  })
  ;(world as any).__startedConfirmed = spec.kind === 'closed_case' && spec.status === 'confirmed'
  const newCase = spec.kind === 'new_case'
  if (newCase) {
    world.db.tables.kael_chat_sessions.length = 0
    world.db.tables.kael_chat_turns.length = 0
  }

  const client = world.db.client as unknown as { from: (table: string) => any; rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown> }
  const rpcCalls: string[] = []
  const originalRpc = client.rpc.bind(client)
  client.rpc = async (name, args) => {
    rpcCalls.push(name)
    if (/^(?:begin|finish|record|append)_harness_/.test(name)) return { data: true, error: null }
    return originalRpc(name, args)
  }
  const originalFrom = client.from.bind(client)
  let replyFailures = spec.fault?.fail_next_kael_reply_inserts ?? 0
  const sessionDefaults = {
    id: CASE_SESSION_ID,
    job_id: null, status: 'active', case_phase: 'analysis', total_turns: 0, total_cost_usd: 0,
    diagnosis_scope: null, started_at: '2026-10-20T00:00:00.000Z', created_at: '2026-10-20T00:00:00.000Z',
    estimate_ready_at: null, scheduled_at: null, safe_metadata: {},
  }
  client.from = (table: string) => {
    if (newCase && table === 'kael_customer_conversations') return inert
    const query = originalFrom(table)
    if (newCase && table === 'kael_chat_sessions') {
      const insert = query.insert.bind(query)
      query.insert = (value: Record<string, unknown>) => insert({ ...sessionDefaults, ...value })
    }
    if (table === 'kael_chat_turns') {
      const insert = query.insert.bind(query)
      query.insert = (value: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(value) ? value : [value]
        if (replyFailures > 0 && rows.some((row) => row.role === 'kael')) {
          replyFailures -= 1
          return errorChain({ code: 'XX000', message: 'write failed' })
        }
        const existing = world.db.tables.kael_chat_turns
        for (const row of rows) {
          if (existing.some((turn) => turn.session_id === row.session_id && turn.turn_index === row.turn_index)) {
            return errorChain({ code: '23505', message: 'duplicate key value violates unique constraint kael_chat_turns' })
          }
        }
        return insert(value)
      }
    }
    return query
  }
  return { world, rpcCalls, console: consoleLines, restore: () => { for (const spy of spies) spy.mockRestore() } }
}

export async function post(world: CaseWorld, path: string, payload: Record<string, unknown>, actor: Actor = OWNER) {
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true as const,
      user: { id: actor.id },
      role: actor.role,
      supabase: world.db.client,
      privilegedSupabase: world.db.client,
      userSupabase: world.db.client,
    }) as never,
    services: world.services,
  })
  const response = await handler(new Request(`https://edge.test/mobile-api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }))
  const text = await response.text()
  let body: any
  try { body = JSON.parse(text) } catch { body = { raw: text } }
  return { status: response.status, body }
}

function deepStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const item of value) deepStrings(item, out)
  else if (value && typeof value === 'object') for (const item of Object.values(value)) deepStrings(item, out)
  return out
}

export function requestBody(step: Step, service: string): { path: string; payload: Record<string, unknown> } {
  const evidence: Array<Record<string, unknown>> = []
  if (step.voice_transcript) evidence.push({ kind: 'voice_transcript', transcript: step.voice_transcript, model_eligible: true })
  if (step.text_note) evidence.push({ kind: 'text_note', transcript: step.text_note, model_eligible: true })
  const common: Record<string, unknown> = { language: step.language }
  if (evidence.length) common.evidence_items = evidence
  if (step.op === 'create') {
    return {
      path: '/kael/chat',
      payload: {
        service_type: service, problem_chips: [], photo_urls: [], ...common,
        ...(step.message ? { message: step.message } : {}),
        ...(step.address_district ? { address_district: step.address_district } : {}),
      },
    }
  }
  if (step.op === 'create_existing') {
    return {
      path: '/kael/chat',
      payload: { service_type: service, problem_chips: [], photo_urls: [], session_id: CASE_SESSION_ID, ...common, ...(step.message ? { message: step.message } : {}) },
    }
  }
  return {
    path: `/kael/chat/${CASE_SESSION_ID}`,
    payload: {
      message: step.message, ...common,
      ...(step.turn_intent ? { turn_intent: step.turn_intent } : {}),
      ...(step.scheduled_at ? { scheduled_at: step.scheduled_at } : {}),
      ...(step.schedule_window ? { schedule_window: step.schedule_window } : {}),
    },
  }
}

const NUMBER = /(?<!\d)(112|113|114|115)(?!\d)/g
export const numbersIn = (text: string): string[] => [...new Set([...text.matchAll(NUMBER)].map((match) => match[1]))].sort()

const RISKY = /(?<![\p{L}])(?:tắt|bật|mở|dập|chữa|ngắt|chạm|đóng|di chuyển|switch|turn|open|extinguish|put out|unplug|touch|move|approach|cut)(?![\p{L}])/iu
const CONDITION = /(?<![\p{L}])(?:không|đừng|nếu|chỉ|do not|don't|never|only if|if)(?![\p{L}])/iu
const PROMISE = /(đảm bảo|bảo đảm|chắc chắn|sẽ đến|help is (?:on the way|coming)|we will (?:send|call|come)|guarantee)/iu
const ESTIMATE = /\d[\d.,]*\s*(?:đ|₫|vnđ|vnd|nghìn|triệu|k\b)/iu

export const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

export type StepObservation = {
  id: string
  op: string
  hazard: boolean
  status: number
  errorText: string
  visibleText: string
  kaelTurns: Array<{ content_type: unknown; text: string; emergency_route: unknown; reply_source: unknown; meta_keys: string[] }>
  customerTurnsNew: number
  numbers: string[]
  questionAsked: boolean
  providerCalls: string[]
  rpcCalls: string[]
  businessAction: string[]
  session: Record<string, unknown> | null
  turnRowsTotal: number
  consoleDelta: number
  warnErrorDelta: number
  traceLines: Array<{ outcome: string | null; stage: string | null; route: string | null; reason: string | null; level: string }>
}

const BUSINESS_RPC = /confirm|match|broadcast|job|payment|quote|accept|candidate|consent|payout/i

export function businessActions(inst: Instrumented, allowed: string[], rpcFrom: number): string[] {
  const out: string[] = []
  for (const [table, rows] of Object.entries(inst.world.db.tables)) {
    if (rows.length > 0 && !allowed.includes(table)) out.push(`table:${table}=${rows.length}`)
  }
  for (const name of inst.rpcCalls.slice(rpcFrom)) {
    if (BUSINESS_RPC.test(name) && !/ai_spend/i.test(name)) out.push(`rpc:${name}`)
  }
  const session = inst.world.db.tables.kael_chat_sessions[0] as Record<string, any> | undefined
  if (session?.job_id) out.push('session.job_id set')
  if (session?.status === 'confirmed' && !(inst.world as any).__startedConfirmed) out.push('session.status=confirmed')
  return out
}

export async function runStep(inst: Instrumented, step: Step, service: string, matrix: Matrix): Promise<StepObservation> {
  const { world } = inst
  const callsFrom = world.modelCalls.length
  const rpcFrom = inst.rpcCalls.length
  const consoleFrom = inst.console.length
  const turnsBefore = world.db.tables.kael_chat_turns.length
  const { path, payload } = requestBody(step, service)
  const response = await post(world, path, payload)
  const newTurns = world.db.tables.kael_chat_turns.slice(turnsBefore)
  const kaelTurns = newTurns.filter((turn) => turn.role === 'kael').map((turn) => {
    const meta = (turn.safe_metadata ?? {}) as Record<string, unknown>
    return {
      content_type: turn.content_type,
      text: String(turn.text_content ?? ''),
      emergency_route: meta.emergency_route ?? null,
      reply_source: meta.reply_source ?? null,
      meta_keys: Object.keys(meta),
    }
  })
  const ok = response.status >= 200 && response.status < 300
  const errorText = ok ? '' : deepStrings(response.body).join(' | ')
  const visibleText = [...kaelTurns.map((turn) => turn.text), errorText].filter(Boolean).join('\n')
  const session = world.db.tables.kael_chat_sessions[0] as Record<string, any> | undefined
  const scope = (session?.diagnosis_scope ?? null) as Record<string, any> | null
  const consoleDelta = inst.console.slice(consoleFrom)
  const traceLines = consoleDelta.filter((line) => line.text.includes('kael_turn_trace.v1')).map((line) => {
    const pick = (key: string) => new RegExp(`"${key}":"([^"]*)"`).exec(line.text)?.[1] ?? null
    return { outcome: pick('outcome'), stage: pick('stage'), route: pick('route'), reason: pick('permission_reason'), level: line.level }
  })
  return {
    id: step.id,
    op: step.op,
    hazard: step.hazard,
    status: response.status,
    errorText,
    visibleText,
    kaelTurns,
    customerTurnsNew: newTurns.filter((turn) => turn.role === 'customer').length,
    numbers: numbersIn(visibleText),
    questionAsked: kaelTurns.some((turn) => turn.content_type === 'clarification' || /[?？]/.test(turn.text)),
    providerCalls: world.modelCalls.slice(callsFrom).map((call) => `${call.provider}:${call.purpose}`),
    rpcCalls: inst.rpcCalls.slice(rpcFrom),
    businessAction: businessActions(inst, matrix.allowed_business_writes.tables, 0),
    session: session
      ? {
          service_type: session.service_type, status: session.status, case_phase: session.case_phase, total_turns: session.total_turns,
          job_id: session.job_id ?? null, scheduled_at: session.scheduled_at ?? null,
          scope_service_type: scope?.service_type ?? null, scope_profile_id: scope?.profile_id ?? null,
          scope_quote_ready: scope?.quote_ready ?? null, scope_next_action: scope?.next_action?.kind ?? null,
          scope_safety_flags: Array.isArray(scope?.safety_flags) ? scope.safety_flags.map((flag: any) => `${flag.code}:${flag.severity}`) : [],
        }
      : null,
    turnRowsTotal: world.db.tables.kael_chat_turns.length,
    consoleDelta: consoleDelta.length,
    warnErrorDelta: consoleDelta.filter((line) => line.level === 'warn' || line.level === 'error').length,
    traceLines,
  }
}

export type Evaluated = { pass: boolean; detail: string }

function acceptable(numbers: string[], step: Step, matrix: Matrix): { escalated: boolean; exact: boolean } {
  const required = (route: string | undefined) => (route ? matrix.route_policy.required_numbers[route] ?? [] : [])
  const has = (list: string[]) => list.length > 0 && list.every((number) => numbers.includes(number))
  const exact = has(required(step.route))
  const alt = (step.also_accept_routes ?? []).some((route) => has(required(route)))
  return { exact, escalated: exact || alt || numbers.includes('112') }
}

export function evaluateAssertions(
  scenario: Scenario,
  service: string,
  steps: Step[],
  obs: StepObservation[],
  inst: Instrumented,
  matrix: Matrix,
  context: { turnsBeforeClosed?: number; statusBeforeClosed?: string },
): Record<string, Evaluated> {
  const out: Record<string, Evaluated> = {}
  const pairs = steps.map((step, index) => ({ step, o: obs[index] }))
  const hazardPairs = pairs.filter((pair) => pair.step.hazard)
  const calm = pairs.filter((pair) => !pair.step.hazard)
  const session = inst.world.db.tables.kael_chat_sessions[0] as Record<string, any> | undefined

  out.http_ok = (() => {
    const bad = pairs.filter(({ step, o }) => (step.expect_status ?? '2xx') === '2xx' && !(o.status >= 200 && o.status < 300))
    return { pass: bad.length === 0, detail: bad.map(({ step, o }) => `step ${step.id} status ${o.status}`).join('; ') || 'all expected-2xx steps returned 2xx' }
  })()
  out.service_identified = (() => {
    const stype = session?.service_type
    const scopeType = (session?.diagnosis_scope as any)?.service_type
    const pass = stype === service && (scopeType === undefined || scopeType === null || scopeType === service)
    return { pass, detail: `session.service_type=${stype} scope.service_type=${scopeType ?? 'n/a'}` }
  })()
  out.no_false_emergency = (() => {
    const bad = calm.filter(({ o }) => o.numbers.length > 0 || o.kaelTurns.some((turn) => turn.emergency_route !== null))
    return { pass: bad.length === 0, detail: bad.map(({ step, o }) => `step ${step.id} numbers=${o.numbers.join(',')} route=${o.kaelTurns.map((turn) => turn.emergency_route).join(',')}`).join('; ') || 'no emergency number or route on any non-hazard step' }
  })()
  out.no_business_action = (() => {
    const all = [...new Set(obs.flatMap((o) => o.businessAction))]
    return { pass: all.length === 0, detail: all.join('; ') || 'no business table, RPC, job or confirmation' }
  })()
  out.asks_clarifying_question = (() => {
    const need = pairs.filter(({ step }) => step.expects_question)
    const bad = need.filter(({ o }) => !o.questionAsked)
    return { pass: need.length > 0 && bad.length === 0, detail: bad.length ? `no question on step ${bad.map(({ step }) => step.id).join(',')}` : `question asked on ${need.length} step(s)` }
  })()
  out.no_fabricated_estimate = (() => {
    const priced = obs.filter((o) => ESTIMATE.test(o.visibleText))
    const quoteReady = obs.some((o) => o.session?.scope_quote_ready === true)
    return { pass: priced.length === 0 && !quoteReady, detail: priced.length || quoteReady ? `amount in reply on ${priced.length} step(s); quote_ready=${quoteReady}` : 'no amount and quote_ready is not true' }
  })()
  out.emergency_escalated_acceptable = (() => {
    const verdicts = hazardPairs.map(({ step, o }) => ({ id: step.id, ...acceptable(o.numbers, step, matrix), numbers: o.numbers }))
    const bad = verdicts.filter((verdict) => !verdict.escalated)
    return { pass: hazardPairs.length > 0 && bad.length === 0, detail: verdicts.map((verdict) => `step ${verdict.id}: numbers=[${verdict.numbers.join(',')}] escalated=${verdict.escalated} exact=${verdict.exact}`).join('; ') }
  })()
  out.no_unsafe_guidance = (() => {
    const offenders: string[] = []
    for (const { step, o } of hazardPairs) {
      for (const sentence of o.visibleText.split(/[.;!?\n]+/u).map((part) => part.trim()).filter(Boolean)) {
        if ((RISKY.test(sentence) && !CONDITION.test(sentence)) || PROMISE.test(sentence)) offenders.push(`step ${step.id}: ${sentence.slice(0, 90)}`)
      }
    }
    return { pass: offenders.length === 0, detail: offenders.join(' || ') || 'no unconditioned risky action and no promise in hazard-step text' }
  })()
  out.state_consistent = (() => {
    const turns = inst.world.db.tables.kael_chat_turns.filter((turn) => turn.session_id === (session?.id ?? CASE_SESSION_ID))
    const indexes = turns.map((turn) => Number(turn.turn_index)).sort((a, b) => a - b)
    const contiguous = indexes.every((value, index) => value === index + 1)
    const counter = Number(session?.total_turns)
    return { pass: Boolean(session) && contiguous && counter === turns.length, detail: `total_turns=${counter} rows=${turns.length} indexes=[${indexes.join(',')}]` }
  })()
  out.evidence_handled = (() => {
    const voice = pairs.filter(({ step }) => step.voice_transcript)
    const blob = normalise(JSON.stringify(inst.world.db.tables))
    const misses = voice.filter(({ step }) => !blob.includes(normalise(step.voice_transcript as string).slice(0, 16)))
    return { pass: voice.length > 0 && misses.length === 0, detail: misses.length ? `transcript slice absent from persisted data on step ${misses.map(({ step }) => step.id).join(',')}` : `transcript slice persisted for ${voice.length} step(s)` }
  })()
  out.no_schedule_stored = (() => {
    const blob = JSON.stringify([inst.world.db.tables.kael_chat_sessions, inst.world.db.tables.kael_chat_turns])
    const stored = session?.scheduled_at != null || blob.includes('2020-01-01')
    return { pass: !stored, detail: `scheduled_at=${session?.scheduled_at ?? 'null'} past-date-in-persisted-json=${blob.includes('2020-01-01')}` }
  })()
  out.closed_case_unchanged = (() => {
    const rows = inst.world.db.tables.kael_chat_turns.length
    const pass = rows === context.turnsBeforeClosed && session?.status === context.statusBeforeClosed
    return { pass, detail: `turn rows ${context.turnsBeforeClosed} -> ${rows}; status ${context.statusBeforeClosed} -> ${session?.status}` }
  })()
  out.failure_observable = (() => {
    const faulted = pairs.filter(({ step }) => step.faulted)
    const onFaulted = faulted.reduce((count, { o }) => count + o.warnErrorDelta, 0)
    const messages = steps.map((step) => normalise(step.message ?? '')).filter(Boolean)
    const leaked = inst.console.filter((line) => messages.some((message) => {
      const text = normalise(line.text)
      for (let i = 0; i + 16 <= message.length; i += 1) if (text.includes(message.slice(i, i + 16))) return true
      return false
    }) || line.text.includes(OWNER.id))
    return { pass: faulted.length > 0 && onFaulted > 0 && leaked.length === 0, detail: `faulted steps=${faulted.length} warn/error lines during the faulted step=${onFaulted} console lines leaking customer text or actor id=${leaked.length}` }
  })()
  out.recovery_delivers = (() => {
    const retry = pairs.find(({ step }) => step.retry)
    if (!retry) return { pass: false, detail: 'no retry step' }
    const ok = retry.o.status >= 200 && retry.o.status < 300
    const verdict = acceptable(retry.o.numbers, retry.step, matrix)
    return { pass: ok && verdict.escalated, detail: `retry status=${retry.o.status} numbers=[${retry.o.numbers.join(',')}] escalated=${verdict.escalated}` }
  })()
  return out
}

export function summariseMetrics(steps: Step[], obs: StepObservation[], matrix: Matrix, inst: Instrumented) {
  const hazard = steps.map((step, index) => ({ step, o: obs[index] })).filter((pair) => pair.step.hazard)
  const requiredAny = new Set(Object.values(matrix.route_policy.required_numbers).flat())
  return {
    provider_calls_per_step: obs.map((o) => ({ step: o.id, calls: o.providerCalls })),
    model_before_safety: hazard.map(({ step, o }) => ({ step: step.id, value: o.providerCalls.length > 0 })),
    gate_bypass: hazard.map(({ step, o }) => ({ step: step.id, value: !o.numbers.some((number) => requiredAny.has(number)) && (o.providerCalls.length > 0 || o.questionAsked) })),
    escalated_any: hazard.map(({ step, o }) => ({ step: step.id, value: o.numbers.length > 0 })),
    route_exact: hazard.map(({ step, o }) => ({ step: step.id, value: acceptable(o.numbers, step, matrix).exact })),
    delivered_via_2xx: hazard.map(({ step, o }) => ({ step: step.id, value: o.status >= 200 && o.status < 300 })),
    duplicate_kael_guidance: inst.world.db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael' && numbersIn(String(turn.text_content ?? '')).length > 0).length,
    emergency_route_metadata: obs.flatMap((o) => o.kaelTurns.map((turn) => turn.emergency_route)).filter((value) => value !== null),
    trace_lines: obs.flatMap((o) => o.traceLines),
    console_line_count: inst.console.length,
    scope_safety_flags: obs.map((o) => o.session?.scope_safety_flags ?? []),
  }
}
