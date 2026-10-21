import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { getKaelPerformanceProfile } from '../../../../../../supabase/functions/mobile-api/_shared/kael/index'
import { customerAuthoredTexts, resolveCaseEmergency } from '../../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/emergency-turn'
import { EMERGENCY_GATE_VERSION } from '../../../../../../supabase/functions/mobile-api/_shared/kael/kael-guardrails/emergency-guidance'
import { __resetRateLimitStoreForTests } from '../../../../../../supabase/functions/mobile-api/_shared/platform/rate-limit'
import {
  CASE_ADMIN_ID,
  OWNER,
  STRANGER,
  installEdgeRuntimeTestHooks,
  type Actor,
  type CaseWorld,
} from '../harness'
import { PROBLEM_CHIP, activeWorld, evidenceWorld, pendingWorld, type Service } from '../harness/emergency-fixtures'

export const PILLAR = {
  id: 'P408-kael-case-emergency-all-fields',
  invariant:
    'every customer-authored text a Case request carries (the message, a reviewed voice transcript, a text note, an evidence summary, a skip reason, the booking description) is checked for a reported emergency before any model, evidence consumption or phase change, on the turn, price-question, create and evidence routes; hazards reported in different fields are routed exactly as if they were one text; the answer writes only what the customer said and one deterministic reply, leaves the Case in the phase it was in, and leaves a bounded, redacted, correlated trace',
  authority: [
    'governance/RULES.md #7 (an emergency classification is not a workflow gate and never confirms, creates or advances money-impacting state)',
    'governance/RULES.md #3 (the safety text is deterministic server copy, not raw model output)',
    'governance/RULES.md #9 (logs carry ids, codes and safe metadata only, never raw chat text or PII)',
    'KAWA_01_Foundation_Safety_Evaluation.pdf W01 (Case intake emergency coverage) and W03 (observability)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/emergency-turn.ts',
  layer: 'integration',
  siblings: ['P407-kael-case-emergency-pending-confirmation', 'P406-kael-case-emergency-intake', 'P405-kael-emergency-signal-matrix'],
  mutation:
    'read only the typed message on the turn route, stop at the first field that reports anything, or let the flagged-path deferral look at a different text than the pipeline does: the voice-transcript, cross-field and deferral rows turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const BENIGN = 'Mình cần thợ xem giúp thiết bị trong căn hộ'
const voice = (transcript: string) => ({ kind: 'voice_transcript', transcript, model_eligible: true })
const note = (transcript: string) => ({ kind: 'text_note', transcript, model_eligible: true })

const emergencyReplies = (world: CaseWorld) =>
  world.kaelTurns().filter((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route !== undefined)
const routesOf = (world: CaseWorld) =>
  emergencyReplies(world).map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route)
const snapshot = (world: CaseWorld) => clone({ session: world.session(), turns: world.db.tables.kael_chat_turns })
const confirmationOf = (world: CaseWorld) =>
  (world.session().safe_metadata as Record<string, any>).intake_confirmation as Record<string, any>

const GENUINE: ReadonlyArray<readonly [string, string, string]> = [
  ['Mình ngửi thấy mùi gas ở bếp', 'gas', '114'],
  ['Ổ cắm đang bốc khói', 'fire', '114'],
  ['Chồng mình bị điện giật, nằm im không cử động', 'medical', '115'],
  ['Có người đột nhập vào nhà', 'police', '113'],
]

describe(`${PILLAR.id}: a reviewed voice transcript or note on the turn route`, () => {
  it.each(GENUINE)('"%s" (%s) is answered although the typed message is ordinary', async (transcript, route, number) => {
    const world = activeWorld()
    const before = clone({ scope: world.session().diagnosis_scope, status: world.session().status, phase: world.session().case_phase })

    const result = await world.request('', { message: BENIGN, language: 'vi', evidence_items: [voice(transcript)] })
    const why = pillarWhy(PILLAR, `status=${result.status} purposes=${result.purposes.join(',')} body=${JSON.stringify(result.body).slice(0, 120)}`)
    expect(result.status, why).toBe(200)
    expect(world.modelCalls, `${why} (a reported emergency asks no model)`).toEqual([])
    expect(routesOf(world), why).toEqual([route])
    expect(String(world.kaelTurns().at(-1)?.text_content), why).toContain(number)
    expect(result.newTurns.map((turn) => turn.role), `${why} (what the customer said, then one reply)`).toEqual(['customer', 'kael'])
    expect(String(result.newTurns[0]?.text_content), `${why} (the words that triggered the reply are on record)`).toContain(transcript)
    expect(clone({ scope: world.session().diagnosis_scope, status: world.session().status, phase: world.session().case_phase }), `${why} (the Case is exactly where it was)`).toEqual(before)
    expect(world.session().job_id, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('answers a text note the same way', async () => {
    const world = activeWorld()

    const result = await world.request('', { message: BENIGN, language: 'vi', evidence_items: [note('Có mùi gas nồng nặc ở bếp')] })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(routesOf(world), why).toEqual(['gas'])
    expect(world.modelCalls, why).toEqual([])
  })

  it('does not answer an ordinary transcript, which goes through the Case exactly as before', async () => {
    const world = activeWorld()

    const result = await world.request('', { message: BENIGN, language: 'vi', evidence_items: [voice('Máy treo tường, hai bộ, khoảng 1 HP')] })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(routesOf(world), why).toEqual([])
  })

  it('answers a transcript sent with the price-question chip, which otherwise persists nothing', async () => {
    const world = activeWorld()

    const result = await world.request('', { message: 'Giá khoảng bao nhiêu?', language: 'vi', turn_intent: 'price_question', evidence_items: [voice('Ổ cắm đang bốc khói')] })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(routesOf(world), why).toEqual(['fire'])
    expect(world.modelCalls, why).toEqual([])
  })

  it('answers advice-only wiring words sent with the price-question chip, and counts that answer as ending the request', async () => {
    const world = activeWorld('electrical')

    const result = await world.request('', { message: 'Giá khoảng bao nhiêu?', language: 'vi', turn_intent: 'price_question', evidence_items: [voice('Ổ cắm tóe lửa khi cắm phích')] })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(routesOf(world), `${why} (the chip persists nothing, so the advice has no later turn to ride on)`).toEqual(['electrical_water'])
    const trace = (world.kaelTurns().at(-1)?.safe_metadata as Record<string, any>).turn_trace
    expect(trace, `${why} (a parked request ends here, so it is an answer, not advice that lets the intake continue)`).toMatchObject({ outcome: 'emergency_stop', gate_entry: 'turn' })
  })

  it('ends every parked request, whichever route the words take', () => {
    const resolve = (text: string, parked: boolean) => resolveCaseEmergency({ message: [text], language: 'vi', serviceType: 'electrical', parked } as never)
    expect(resolve('Ổ cắm tóe lửa khi cắm phích', true)?.stopsTurn, pillarWhy(PILLAR, 'a parked wiring hazard has no later turn to continue on')).toBe(true)
    expect(resolve('Ổ cắm tóe lửa khi cắm phích', false)?.stopsTurn, pillarWhy(PILLAR, 'the same words on a live turn only advise')).toBe(false)
  })

  it('keeps the safety signal that a later field raised on the Case, not only the first field\'s', async () => {
    const world = activeWorld('electrical', { env: { KAEL_PLAYBOOK_ELECTRICAL_ENABLED: 'true' } })

    const result = await world.request('', { message: BENIGN, language: 'vi', evidence_items: [voice('Ổ cắm đang bốc khói')] })
    const signals = (world.session().safe_metadata as Record<string, unknown>).intake_safety_signals
    expect(result.status, pillarWhy(PILLAR, `status=${result.status}`)).toBe(200)
    expect(Array.isArray(signals) ? signals : [], pillarWhy(PILLAR, 'the typed message is ordinary; the transcript is what carries the hazard')).not.toEqual([])
  })
})

describe(`${PILLAR.id}: the same words while the booking confirmation is pending`, () => {
  it.each(GENUINE)('a transcript "%s" (%s) is answered, not refused with 409, and the booking stays pending', async (transcript, route) => {
    const world = pendingWorld('hvac')
    const confirmationBefore = clone(confirmationOf(world))

    const result = await world.request('', { message: BENIGN, language: 'vi', evidence_items: [voice(transcript)] })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 120)}`)
    expect(result.status, why).toBe(200)
    expect(routesOf(world), why).toEqual([route])
    expect(confirmationOf(world), `${why} (only the customer decides the booking)`).toEqual(confirmationBefore)
    expect(world.session().job_id, why).toBeNull()
    expect(world.modelCalls, why).toEqual([])
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('keeps the 409 for an ordinary transcript and writes nothing', async () => {
    const world = pendingWorld('hvac')
    const before = snapshot(world)

    const result = await world.request('', { message: BENIGN, language: 'vi', evidence_items: [voice('Máy treo tường, hai bộ')] })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(409)
    expect(snapshot(world), why).toEqual(before)
  })
})

describe(`${PILLAR.id}: hazards reported in different fields are one report`, () => {
  const FIELD_CASES: ReadonlyArray<readonly [string, string, string, string]> = [
    ['a wiring hazard in the message, a gas leak in the transcript', 'Ổ cắm tóe lửa khi cắm phích', 'Mình ngửi thấy mùi gas ở bếp', 'gas'],
    ['a gas leak in the message, a wiring hazard in the transcript', 'Mình ngửi thấy mùi gas ở bếp', 'Ổ cắm tóe lửa khi cắm phích', 'gas'],
    ['smoke in the message, a gas leak in the transcript', 'Ổ cắm đang bốc khói', 'Mình ngửi thấy mùi gas ở bếp', 'gas'],
    ['a gas leak in the message, a person hurt in the transcript', 'Mình ngửi thấy mùi gas ở bếp', 'Chồng mình bị điện giật, nằm im không cử động', 'uncertain'],
    ['smoke in the message, an intruder in the transcript', 'Ổ cắm đang bốc khói', 'Có người đột nhập vào nhà', 'uncertain'],
  ]

  it.each(FIELD_CASES)('%s is routed %s', async (_name, message, transcript, route) => {
    const world = activeWorld()

    const result = await world.request('', { message, language: 'vi', evidence_items: [voice(transcript)] })
    const why = pillarWhy(PILLAR, `status=${result.status} routes=${routesOf(world).join(',')}`)
    expect(result.status, why).toBe(200)
    expect(routesOf(world), `${why} (the guidance for the combined report, answered once)`).toEqual([route])
    expect(world.modelCalls, why).toEqual([])
  })

  const POSITIVES = [
    'Ổ cắm đang bốc khói',
    'Chồng mình bị điện giật, nằm im không cử động',
    'Có người đột nhập vào nhà',
    'Ổ cắm tóe lửa khi cắm phích',
    'Mình ngửi thấy mùi gas ở bếp',
    'Bình gas nhà em đang xì',
  ]
  const routeOf = (texts: readonly string[]) => resolveCaseEmergency({
    message: texts,
    language: 'vi',
    serviceType: 'hvac',
    parked: true,
  } as never)?.guidance.route ?? null

  it('routes two fields exactly as the same two sentences in one text, in either order', () => {
    const disagreements: string[] = []
    for (const first of POSITIVES) {
      for (const second of POSITIVES) {
        const apart = routeOf([first, second])
        const together = routeOf([`${first}. ${second}`])
        const swapped = routeOf([second, first])
        if (apart !== together || apart !== swapped) disagreements.push(`${first} + ${second}: apart=${apart} together=${together} swapped=${swapped}`)
      }
    }
    expect(disagreements, pillarWhy(PILLAR, 'a field order or a field boundary must never change which guidance a customer gets')).toEqual([])
  })

  it('lets a later field report a danger that an earlier field only hints at', () => {
    expect(routeOf(['Cần hỗ trợ khẩn cấp', 'Mình ngửi thấy mùi gas ở bếp']), pillarWhy(PILLAR, 'generic urgency in one field is not an answer on its own, but it must not hide a gas leak in the next')).toBe('gas')
  })
})

describe(`${PILLAR.id}: the flagged safety path and the gate read the same text`, () => {
  const flagged = { KAEL_PLAYBOOK_ELECTRICAL_ENABLED: 'true' }

  it.each([{}, flagged])('answers a smoke report that only the transcript carries (env %j)', async (env) => {
    const world = activeWorld('electrical', { env })

    const result = await world.request('', { message: BENIGN, language: 'vi', evidence_items: [voice('Ổ cắm đang bốc khói')] })
    const why = pillarWhy(PILLAR, `status=${result.status} purposes=${result.purposes.join(',')}`)
    expect(result.status, why).toBe(200)
    expect(world.kaelTurns().some((turn) => String(turn.text_content).includes('114')), `${why} (some reply names 114, whichever path owns the hazard)`).toBe(true)
  })
})

describe(`${PILLAR.id}: evidence and skip reasons on the evidence route`, () => {
  async function submit(world: CaseWorld, body: Record<string, unknown>, actor: Actor = OWNER) {
    return world.request('/evidence', { language: 'vi', ...body }, { as: actor })
  }

  it('answers an emergency written as the reason for skipping required evidence, not a 409', async () => {
    const world = evidenceWorld()
    const before = clone({ scope: world.session().diagnosis_scope, status: world.session().status })

    const result = await submit(world, { decision: 'skipped', skip_reason: 'Không gửi được ảnh vì có mùi gas nồng nặc' })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 140)}`)
    expect(result.status, why).toBe(200)
    expect(routesOf(world), why).toEqual(['gas'])
    expect(clone({ scope: world.session().diagnosis_scope, status: world.session().status }), `${why} (the Case still waits for its evidence)`).toEqual(before)
    expect(world.modelCalls, why).toEqual([])
  })

  it('keeps refusing to skip required evidence for an ordinary reason', async () => {
    const world = evidenceWorld()

    const result = await submit(world, { decision: 'skipped', skip_reason: 'Không tiện chụp lúc này' })
    expect(result.status, pillarWhy(PILLAR, JSON.stringify(result.body).slice(0, 120))).toBe(409)
  })

  it.each([
    ['voice', voice('Mình ngửi thấy mùi gas ở bếp')],
    ['text note', note('Mình ngửi thấy mùi gas ở bếp')],
  ])('answers a %s submitted as evidence and leaves the Case waiting for evidence', async (_name, item) => {
    const world = evidenceWorld()
    const before = clone({ scope: world.session().diagnosis_scope, status: world.session().status, phase: world.session().case_phase })

    const result = await submit(world, { decision: 'confirmed', evidence_items: [item] })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 140)}`)
    expect(result.status, why).toBe(200)
    expect(routesOf(world), why).toEqual(['gas'])
    expect(clone({ scope: world.session().diagnosis_scope, status: world.session().status, phase: world.session().case_phase }), `${why} (the reply does not clear the request for evidence or move the phase)`).toEqual(before)
    expect(world.modelCalls, why).toEqual([])
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('combines a wiring hazard in the message with a gas leak in a note', async () => {
    const world = evidenceWorld()

    const result = await submit(world, { decision: 'confirmed', message: 'Ổ cắm tóe lửa khi cắm phích', evidence_items: [note('Mình ngửi thấy mùi gas ở bếp')] })
    expect(result.status, pillarWhy(PILLAR, JSON.stringify(result.body).slice(0, 120))).toBe(200)
    expect(routesOf(world), pillarWhy(PILLAR, 'the gas guidance covers the wiring hazard too')).toEqual(['gas'])
  })
})

function createWorld(service: Service) {
  const world = pendingWorld(service)
  world.db.tables.kael_chat_sessions.length = 0
  world.db.tables.kael_chat_turns.length = 0
  const inert: unknown = new Proxy(function () {}, {
    get: (_target, property) => property === 'then'
      ? (resolve: (value: unknown) => unknown) => Promise.resolve({ data: { id: 'conversation-stub' }, error: null }).then(resolve)
      : () => inert,
    apply: () => inert,
  })
  const client = world.db.client as unknown as { from: (table: string) => unknown }
  const original = client.from.bind(client)
  const sessionDefaults = {
    job_id: null, status: 'active', case_phase: 'analysis', total_turns: 0, total_cost_usd: 0,
    diagnosis_scope: null, started_at: '2026-10-20T00:00:00.000Z', created_at: '2026-10-20T00:00:00.000Z',
    estimate_ready_at: null, scheduled_at: null, safe_metadata: {},
  }
  client.from = (table: string) => {
    if (table === 'kael_customer_conversations') return inert
    const query = original(table) as { insert: (value: Record<string, unknown>) => unknown }
    if (table !== 'kael_chat_sessions') return query
    const insert = query.insert.bind(query)
    query.insert = (value) => insert({ ...sessionDefaults, ...value })
    return query
  }
  return world
}

function bookingBody(service: Service, overrides: Record<string, unknown>) {
  const date = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const scheduledAt = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 9 - 7, 0)).toISOString()
  return {
    service_type: service,
    profile_id: getKaelPerformanceProfile(service)!.id,
    intake_source: 'booking',
    intake_description: 'Cần thợ xem giúp thiết bị trong căn hộ vào cuối tuần',
    message: 'Cần thợ xem giúp thiết bị trong căn hộ vào cuối tuần',
    problem_chips: [PROBLEM_CHIP[service]],
    address_label: 'Căn hộ thử nghiệm',
    address_district: 'Quận 7',
    scheduled_at: scheduledAt,
    schedule_window: { date, start: '09:00', end: '11:00', time_zone: 'Asia/Ho_Chi_Minh' },
    client_request_id: '40800000-0000-4000-8000-000000000001',
    language: 'vi',
    ...overrides,
  }
}

async function createCase(world: CaseWorld, body: Record<string, unknown>) {
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true as const,
      user: { id: OWNER.id },
      role: OWNER.role,
      supabase: world.db.client,
      privilegedSupabase: world.db.client,
      userSupabase: world.db.client,
    }) as never,
    services: world.services,
  })
  const response = await handler(new Request('https://edge.test/mobile-api/kael/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return { status: response.status, body: await response.json() as Record<string, any> }
}

const createdReplies = (world: CaseWorld) => world.db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael')

describe(`${PILLAR.id}: a Case created with a voice transcript`, () => {
  it('answers a booking whose voice transcript reports the danger, and the confirmation stays pending', async () => {
    const world = createWorld('hvac')

    const created = await createCase(world, bookingBody('hvac', { evidence_items: [voice('Mình ngửi thấy mùi gas ở bếp')] }))
    const why = pillarWhy(PILLAR, `status=${created.status} turns=${world.db.tables.kael_chat_turns.length}`)
    expect(created.status, why).toBeLessThan(300)
    expect(createdReplies(world).map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route), why).toEqual(['gas'])
    expect(world.modelCalls, why).toEqual([])
    const session = world.db.tables.kael_chat_sessions[0] as Record<string, any>
    expect(session.safe_metadata.intake_confirmation.status, why).toBe('pending')
    expect(session.job_id ?? null, why).toBeNull()
  })

  it('answers a direct chat whose voice transcript reports the danger, before any model runs', async () => {
    const world = createWorld('hvac')

    const created = await createCase(world, {
      service_type: 'hvac',
      message: BENIGN,
      problem_chips: [],
      photo_urls: [],
      evidence_items: [voice('Ổ cắm đang bốc khói')],
      client_request_id: '40800000-0000-4000-8000-000000000002',
      language: 'vi',
    })
    const why = pillarWhy(PILLAR, `status=${created.status} purposes=${world.modelCalls.map((call) => call.purpose).join(',')}`)
    expect(created.status, why).toBeLessThan(300)
    expect(createdReplies(world).map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route), why).toEqual(['fire'])
    expect(world.modelCalls, why).toEqual([])
  })

  it('answers a Case started by voice alone, which has no typed message to check', async () => {
    const world = createWorld('hvac')

    const created = await createCase(world, {
      service_type: 'hvac',
      problem_chips: [],
      photo_urls: [],
      evidence_items: [voice('Mình ngửi thấy mùi gas ở bếp')],
      client_request_id: '40800000-0000-4000-8000-000000000003',
      language: 'vi',
    })
    const why = pillarWhy(PILLAR, `status=${created.status} turns=${world.db.tables.kael_chat_turns.length}`)
    expect(created.status, why).toBeLessThan(300)
    expect(createdReplies(world).map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route), why).toEqual(['gas'])
    expect(world.modelCalls, why).toEqual([])
  })

  it('stays quiet for an ordinary transcript', async () => {
    const world = createWorld('hvac')

    const created = await createCase(world, bookingBody('hvac', { evidence_items: [voice('Máy treo tường, hai bộ')] }))
    expect(created.status, pillarWhy(PILLAR, `status=${created.status}`)).toBeLessThan(300)
    expect(createdReplies(world), pillarWhy(PILLAR, 'an ordinary booking waits for the customer')).toEqual([])
  })
})

describe(`${PILLAR.id}: refused actors write nothing, whatever field carries the emergency`, () => {
  it.each([
    ['another customer', STRANGER, 404],
    ['a worker', { id: STRANGER.id, role: 'worker' as const }, 403],
    ['an admin', { id: CASE_ADMIN_ID, role: 'admin' as const }, 403],
  ])('%s gets no reply and no write for a transcript emergency', async (_name, actor, status) => {
    const world = activeWorld()
    const before = snapshot(world)

    const result = await world.request('', { message: BENIGN, language: 'vi', evidence_items: [voice('Ổ cắm đang bốc khói')] }, { as: actor })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(status)
    expect(snapshot(world), why).toEqual(before)
    expect(world.modelCalls, why).toEqual([])
  })
})

describe(`${PILLAR.id}: the texts the gate reads are the texts the Case reads`, () => {
  it('collects the message, transcripts, notes, summaries, skip reason and description once each', () => {
    const texts = customerAuthoredTexts({
      message: '  Cần thợ  ',
      skipReason: 'Không gửi được ảnh',
      intakeDescription: 'Cần thợ',
      evidenceItems: [
        { transcript: 'Ổ cắm đang bốc khói' },
        { summary: 'Khung hình cho thấy khói' },
        { transcript: 'Ổ cắm đang bốc khói' },
        {},
      ],
    })
    expect(texts, pillarWhy(PILLAR, 'every field is read, blanks and repeats are not')).toEqual([
      'Cần thợ',
      'Không gửi được ảnh',
      'Ổ cắm đang bốc khói',
      'Khung hình cho thấy khói',
    ])
  })

  it('has every caller of advanceKaelChatEstimate read all customer-authored fields through the shared collector', () => {
    const root = join(process.cwd(), '..', '..', 'supabase', 'functions', 'mobile-api', '_shared')
    const sources: string[] = []
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (entry.name.endsWith('.ts')) sources.push(path)
      }
    }
    walk(root)

    const callers = sources.filter((path) => !path.endsWith('advance.ts') && /\badvanceKaelChatEstimate\(/.test(readFileSync(path, 'utf8')))
    const viaShared = (path: string) => /\bcustomerAuthoredTexts\(/.test(readFileSync(path, 'utf8')) || /\bresolveCaseEmergency\(\{\s*message: confirmation\.intake\.description/.test(readFileSync(path, 'utf8'))
    const unread = callers.filter((path) => !viaShared(path)).map((path) => relative(root, path))
    expect(callers.length, pillarWhy(PILLAR, 'the scan found the known callers')).toBeGreaterThanOrEqual(4)
    expect(unread, pillarWhy(PILLAR, 'a caller whose gate reads a narrower set of texts than the Case does')).toEqual([])
  })
})

describe(`${PILLAR.id}: a bounded, redacted, correlated trace`, () => {
  // The HTTP layer binds a fresh trace id to every request, so correlation never depends on the client.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const IDENTITY = {
    releaseId: 'harness-0123456789ab-fedcba987654',
    deploymentId: 'iwevizmsedyqozxlawwl_5e1f2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b_297',
    clientPlatform: 'ios',
    clientBuildNumber: 57,
    clientEasBuildId: '7d3c1f0e-8b2a-4c6d-9e5f-1a2b3c4d5e6f',
    clientGitSha: 'a06afacef09420e5678fa928db1b23b088b954e4',
    clientReleaseId: 'harness-0123456789ab-fedcba987654',
  } as const

  beforeEach(() => {
    __resetRateLimitStoreForTests()
  })

  const traceOf = (world: CaseWorld) => (world.kaelTurns().at(-1)?.safe_metadata as Record<string, unknown>).turn_trace as Record<string, unknown> | undefined

  it('records route, stage, outcome, reason, entry, gate version, correlation and release identity on the reply, and no text', async () => {
    const world = activeWorld()

    const result = await world.request('', { message: BENIGN, language: 'vi', evidence_items: [voice('Mình ngửi thấy mùi gas ở bếp')] }, { identity: IDENTITY })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(traceOf(world), why).toEqual({
      schema: 'kael_turn_trace.v1',
      correlation_id: expect.stringMatching(UUID),
      route: 'case_emergency',
      stage: 'emergency_gate',
      outcome: 'emergency_stop',
      service_code: 'hvac',
      case_phase: 'analysis',
      permission_reason: 'EMERGENCY_GAS',
      gate_entry: 'turn',
      emergency_gate_version: EMERGENCY_GATE_VERSION,
      edge_release_id: IDENTITY.releaseId,
      edge_deployment_id: IDENTITY.deploymentId,
      client_release_id: IDENTITY.clientReleaseId,
      client_git_sha: IDENTITY.clientGitSha,
      client_build_number: 57,
      client_eas_build_id: IDENTITY.clientEasBuildId,
      client_platform: 'ios',
    })
    expect(JSON.stringify(traceOf(world)), `${why} (nothing the customer wrote)`).not.toMatch(/mùi gas|bếp|căn hộ/u)
  })

  it('logs the emergency without any actor pseudonym and without text, once per allowance bucket', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const world = activeWorld()

    await world.request('', { message: BENIGN, language: 'vi', evidence_items: [voice('Ổ cắm đang bốc khói')] }, { identity: IDENTITY })
    const lines = warn.mock.calls.filter((call) => call[0] === 'kael_turn_trace').map((call) => call[1] as Record<string, unknown>)
    warn.mockRestore()
    const why = pillarWhy(PILLAR, `lines=${JSON.stringify(lines).slice(0, 200)}`)
    expect(lines.length, why).toBe(1)
    expect(lines[0], why).toMatchObject({ route: 'case_emergency', stage: 'emergency_gate', permission_reason: 'EMERGENCY_FIRE', correlation_id: expect.stringMatching(UUID) })
    expect(lines[0]?.correlation_id, `${why} (the log line and the persisted reply share one correlation id)`).toBe(traceOf(world)?.correlation_id)
    expect(lines[0], `${why} (a stable pseudonym beside a fire, health or police code would profile one person)`).not.toHaveProperty('actor_role_hash')
    expect(JSON.stringify(lines), why).not.toMatch(/bốc khói|Ổ cắm/u)
  })

  it('labels advice that lets the intake continue differently from an answer that ends the turn', async () => {
    const world = activeWorld('electrical')

    await world.request('', { message: 'Ổ cắm tóe lửa khi cắm phích', language: 'vi' }, { identity: IDENTITY })
    const advice = emergencyReplies(world).at(-1)?.safe_metadata as Record<string, any> | undefined
    expect(advice?.turn_trace, pillarWhy(PILLAR, 'a wiring hazard advises and the turn continues')).toMatchObject({ outcome: 'emergency_advice', permission_reason: 'EMERGENCY_ELECTRICAL_WATER', gate_entry: 'turn' })
  })

  it.each([
    ['evidence route', 'evidence'],
    ['create route', 'create'],
  ])('traces the %s with its own entry', async (_name, entry) => {
    if (entry === 'evidence') {
      const world = evidenceWorld()
      await world.request('/evidence', { language: 'vi', decision: 'confirmed', evidence_items: [note('Mình ngửi thấy mùi gas ở bếp')] }, { identity: IDENTITY })
      expect(traceOf(world), pillarWhy(PILLAR, 'evidence route')).toMatchObject({ route: 'case_emergency', gate_entry: 'evidence', correlation_id: expect.stringMatching(UUID) })
      return
    }
    const world = createWorld('hvac')
    const handler = createMobileApiHandler({
      authenticate: async () => ({
        success: true as const,
        user: { id: OWNER.id },
        role: OWNER.role,
        supabase: world.db.client,
        privilegedSupabase: world.db.client,
        userSupabase: world.db.client,
        ...IDENTITY,
      }) as never,
      services: world.services,
    })
    await handler(new Request('https://edge.test/mobile-api/kael/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bookingBody('hvac', { intake_description: 'Mình ngửi thấy mùi gas ở bếp', message: 'Mình ngửi thấy mùi gas ở bếp' })),
    }))
    const reply = createdReplies(world).at(-1)
    expect((reply?.safe_metadata as Record<string, unknown>).turn_trace, pillarWhy(PILLAR, 'create route')).toMatchObject({ route: 'case_emergency', gate_entry: 'create', correlation_id: expect.stringMatching(UUID) })
  })

  it('invents no client identity for a legacy client, and still answers', async () => {
    const world = activeWorld()

    const result = await world.request('', { message: BENIGN, language: 'vi', evidence_items: [voice('Mình ngửi thấy mùi gas ở bếp')] })
    expect(result.status, pillarWhy(PILLAR, `status=${result.status}`)).toBe(200)
    const trace = traceOf(world) ?? {}
    expect(trace, pillarWhy(PILLAR, 'the gate fields are present without any client header')).toMatchObject({
      schema: 'kael_turn_trace.v1',
      route: 'case_emergency',
      stage: 'emergency_gate',
      outcome: 'emergency_stop',
      permission_reason: 'EMERGENCY_GAS',
      gate_entry: 'turn',
      emergency_gate_version: EMERGENCY_GATE_VERSION,
    })
    expect(Object.keys(trace).filter((key) => key.startsWith('client_')), pillarWhy(PILLAR, 'no invented client identity')).toEqual([])
  })
})
