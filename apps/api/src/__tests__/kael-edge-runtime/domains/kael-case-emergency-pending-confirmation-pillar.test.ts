import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { buildInitialDiagnosisScopeArtifact, getKaelPerformanceProfile } from '../../../../../../supabase/functions/mobile-api/_shared/kael/index'
import { buildKaelIntakeConfirmation } from '../../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/intake-confirmation'
import {
  CASE_ADMIN_ID,
  CASE_SESSION_ID,
  OWNER,
  STRANGER,
  assistantReply,
  classifierReply,
  createCaseWorld,
  installEdgeRuntimeTestHooks,
  unitAnswered,
  type Actor,
  type CaseWorld,
  type ModelReplyFn,
} from '../harness'

export const PILLAR = {
  id: 'P407-kael-case-emergency-pending-confirmation',
  invariant:
    'a customer who reports a fire, medical, police or unclear emergency, or a wiring or water hazard, while a booking intake confirmation is still pending receives deterministic Vietnam emergency guidance instead of a 409, and the confirmation stays pending: it is never confirmed, corrected or abandoned by the reply, and no Job, quote, match or payment is created; any other message is still refused until the customer decides',
  authority: [
    'governance/RULES.md #7 (an emergency classification is not a workflow gate and never confirms, creates or advances money-impacting state)',
    'governance/RULES.md #3 (the safety text is deterministic server copy, not raw model output)',
    'governance/RULES.md #8 (a refusal or a failed write is visible, never a fabricated success)',
    'KAWA_01_Foundation_Safety_Evaluation.pdf W01 (Case intake emergency coverage, no flag bypass)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/emergency-turn.ts',
  layer: 'integration',
  siblings: ['P406-kael-case-emergency-intake', 'P405-kael-emergency-signal-matrix', 'P401-kael-emergency-routing'],
  mutation:
    'run the pending-confirmation check before the emergency check, or make the emergency reply confirm the intake: the 409 row and the still-pending row turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const SERVICES = ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'] as const
type Service = typeof SERVICES[number]

const healthyModel: ModelReplyFn = (call) => {
  if (call.purpose === 'case_turn_intent') {
    return classifierReply({ intent: 'provide_information', confidence: 0.9, pending_slot_answer: unitAnswered('1 máy') })
  }
  if (call.purpose === 'normal_chat_response') return assistantReply()
  return { content: '{}' }
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const emergencyTurns = (world: CaseWorld) =>
  world.kaelTurns().filter((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route !== undefined)
const confirmationOf = (world: CaseWorld) =>
  (world.session().safe_metadata as Record<string, any>).intake_confirmation as Record<string, any>
const snapshot = (world: CaseWorld) => clone({ session: world.session(), turns: world.db.tables.kael_chat_turns })

const PROBLEM_CHIP: Record<Service, string> = {
  electrical: 'other_electrical',
  plumbing: 'other_plumbing',
  cleaning: 'other_cleaning',
  hvac: 'other_hvac',
  upholstery: 'other_upholstery',
  handyman: 'other_handyman',
}

// A booking Case whose intake confirmation is waiting for the customer, built by the same builder the server uses.
function pendingWorld(service: Service, options: { description?: string; env?: Record<string, string> } = {}) {
  const world = createCaseWorld({
    service,
    artifact: buildInitialDiagnosisScopeArtifact({ serviceType: service, customerGoal: 'Cần hỗ trợ' }),
    model: healthyModel,
    env: options.env,
  })
  const profile = getKaelPerformanceProfile(service)
  const date = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const scheduledAt = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 9 - 7, 0)).toISOString()
  const confirmation = buildKaelIntakeConfirmation({
    actorId: OWNER.id,
    serviceType: service,
    profileId: profile!.id,
    description: options.description ?? 'Cần thợ xem giúp thiết bị trong căn hộ vào cuối tuần',
    problemChips: [PROBLEM_CHIP[service]],
    addressLabel: 'Căn hộ thử nghiệm',
    addressDistrict: 'Quận 7',
    scheduledAt,
    scheduleWindow: { date, start: '09:00', end: '11:00', time_zone: 'Asia/Ho_Chi_Minh' },
    language: 'vi',
  } as never)
  expect(confirmation.blocking, 'the fixture confirmation must be confirmable').toBe(false)
  expect(confirmation.status, 'the fixture confirmation must be pending').toBe('pending')
  world.session().safe_metadata = { ...world.session().safe_metadata, intake_confirmation: confirmation }
  return world
}

function callerFor(world: CaseWorld, actor: Actor) {
  return createMobileApiHandler({
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
}

async function decide(world: CaseWorld, decision: 'confirmed' | 'correction_requested', actor: Actor = OWNER, sessionId: string = CASE_SESSION_ID) {
  const response = await callerFor(world, actor)(new Request(`https://edge.test/mobile-api/kael/chat/${sessionId}/intake-confirmation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision }),
  }))
  return { status: response.status, body: await response.json() as Record<string, any> }
}

const GENUINE: ReadonlyArray<readonly [Service, string, string, string]> = [
  ['electrical', 'Ổ cắm đang bốc khói', 'fire', '114'],
  ['plumbing', 'Ống nước vỡ và có người bị điện giật', 'medical', '115'],
  ['cleaning', 'Có người đột nhập vào nhà', 'police', '113'],
  ['hvac', 'Máy lạnh đang cháy', 'fire', '114'],
  ['upholstery', 'Ghế sofa đang cháy', 'fire', '114'],
  ['handyman', 'Thợ bị ngã bất tỉnh', 'medical', '115'],
]

describe(`${PILLAR.id}: an emergency typed while the booking confirmation is pending`, () => {
  it.each(GENUINE)('%s: "%s" -> %s guidance naming %s, no 409, no model call, confirmation still pending', async (service, message, route, number) => {
    const world = pendingWorld(service)
    const confirmationBefore = clone(confirmationOf(world))

    const result = await world.send(message)
    const why = pillarWhy(PILLAR, `${service}: status=${result.status} body=${JSON.stringify(result.body).slice(0, 160)}`)
    expect(result.status, why).toBe(200)
    expect(world.modelCalls, `${why} (a deterministic emergency reply asks no model)`).toEqual([])
    const reply = world.kaelTurns().at(-1)
    expect(String(reply?.text_content), why).toContain(number)
    expect(reply?.safe_metadata, why).toMatchObject({ emergency_route: route, safety_source: 'deterministic_emergency' })
    expect(result.newTurns.map((turn) => turn.role), `${why} (what the customer said, then one reply)`).toEqual(['customer', 'kael'])
    expect(confirmationOf(world), `${why} (the reply does not confirm, correct or alter the booking)`).toEqual(confirmationBefore)
    expect(confirmationOf(world).status, why).toBe('pending')
    expect(world.session().status, why).toBe('active')
    expect(world.session().job_id, `${why} (an emergency never creates a Job)`).toBeNull()
    expect(world.unexpectedWrites(), `${why} (no quote, match or payment row)`).toEqual([])
    const indexes = world.db.tables.kael_chat_turns.map((turn) => Number(turn.turn_index))
    expect(new Set(indexes).size, `${why} (turn indexes are unique: the real table refuses a duplicate)`).toBe(indexes.length)
    expect(world.session().total_turns, `${why} (the session counts every turn it holds)`).toBe(Math.max(...indexes))
  })

  it('advises on a wiring or water hazard too, because the intake cannot continue until the customer decides', async () => {
    const world = pendingWorld('electrical')

    const result = await world.send('Ổ cắm tóe lửa khi cắm phích')
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world).map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route), why).toEqual(['electrical_water'])
    expect(String(emergencyTurns(world)[0]?.text_content), why).toMatch(/114.*115.*112/)
    expect(confirmationOf(world).status, why).toBe('pending')
  })

  it('answers with every playbook flag on and with the AI kill switch on, from the gate alone', async () => {
    const flags = Object.fromEntries(SERVICES.map((service) => [`KAEL_PLAYBOOK_${service.toUpperCase()}_ENABLED`, 'true']))
    for (const env of [flags, { KAEL_AI_KILL_SWITCH: 'true' }]) {
      const world = pendingWorld('electrical', { env })

      const result = await world.send('Ổ cắm đang bốc khói')
      const why = pillarWhy(PILLAR, `env=${Object.keys(env).slice(0, 2).join(',')} status=${result.status}`)
      expect(result.status, why).toBe(200)
      expect(emergencyTurns(world).length, `${why} (no flagged path runs while the intake is pending, so the gate answers)`).toBe(1)
      expect(world.modelCalls, why).toEqual([])
      expect(confirmationOf(world).status, why).toBe('pending')
    }
  })
})

describe(`${PILLAR.id}: every other message is still refused until the customer decides`, () => {
  it.each([
    'Nhà mình ở tầng 5, có thang máy',
    'Máy lạnh đang chạy nhưng không mát',
    'Ổ cắm bị cháy từ tuần trước, nhờ thợ thay',
    'Nước đang chảy ra từ vòi, cần hỗ trợ khẩn cấp',
  ])('"%s" keeps the 409 and writes nothing', async (message) => {
    const world = pendingWorld('hvac')
    const before = snapshot(world)

    const result = await world.send(message)
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 160)}`)
    expect(result.status, why).toBe(409)
    expect(JSON.stringify(result.body), why).toContain('INTAKE_CONFIRMATION_REQUIRED')
    expect(snapshot(world), `${why} (the refusal writes nothing)`).toEqual(before)
    expect(world.modelCalls, why).toEqual([])
  })

  it('does not treat an unrelated session status as a way around the refusal', async () => {
    const world = pendingWorld('hvac')
    world.session().status = 'abandoned'
    const before = snapshot(world)

    const result = await world.send('Máy lạnh đang cháy')
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, `${why} (an abandoned Case takes no message at all; a new Case's first message is gated)`).toBe(409)
    expect(snapshot(world), why).toEqual(before)
  })
})

describe(`${PILLAR.id}: the booking decision stays the customer's`, () => {
  it('lets the customer confirm afterwards, and only then does the analysis begin', async () => {
    const world = pendingWorld('hvac')
    await world.send('Máy lạnh đang cháy')
    expect(confirmationOf(world).status).toBe('pending')
    expect(world.session().job_id).toBeNull()

    const decided = await decide(world, 'confirmed')
    const why = pillarWhy(PILLAR, `status=${decided.status}`)
    expect(decided.status, why).toBe(200)
    expect(confirmationOf(world).status, why).toBe('confirmed')
    expect(world.session().job_id, `${why} (confirming the intake is not creating a Job)`).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('lets the customer ask for a correction instead, which is the existing abandon path', async () => {
    const world = pendingWorld('hvac')
    await world.send('Máy lạnh đang cháy')

    const decided = await decide(world, 'correction_requested')
    const why = pillarWhy(PILLAR, `status=${decided.status}`)
    expect(decided.status, why).toBe(200)
    expect(confirmationOf(world).status, why).toBe('correction_requested')
    expect(world.session().status, why).toBe('abandoned')
  })

  it('sends a later emergency through the ordinary Case gate once the customer has confirmed', async () => {
    const world = pendingWorld('hvac')
    await decide(world, 'confirmed')
    const before = emergencyTurns(world).length

    const result = await world.send('Máy lạnh đang cháy')
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, `${why} (no 409 once the confirmation is decided)`).toBe(200)
    expect(emergencyTurns(world).length, why).toBe(before + 1)
    expect(world.session().job_id, why).toBeNull()
  })

  it('answers the same report again on a replay without creating any business record', async () => {
    const world = pendingWorld('hvac')

    await world.send('Máy lạnh đang cháy')
    await world.send('Máy lạnh đang cháy')
    const why = pillarWhy(PILLAR, `kael turns=${world.kaelTurns().length}`)
    expect(emergencyTurns(world).length, why).toBe(2)
    expect(confirmationOf(world).status, why).toBe('pending')
    expect(world.session().job_id, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
    expect(world.modelCalls, why).toEqual([])
  })
})

describe(`${PILLAR.id}: the reply never moves the Case to another phase`, () => {
  it.each(['active', 'collecting_evidence', 'estimate_ready'])('leaves a Case in status %s in that status after the emergency reply', async (status) => {
    const world = pendingWorld('hvac')
    world.session().status = status

    const result = await world.send('Máy lạnh đang cháy')
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(world.session().status, why).toBe(status)
    expect(world.session().case_phase, why).toBe('analysis')
    expect(confirmationOf(world).status, why).toBe('pending')
  })
})

describe(`${PILLAR.id}: refused actors write nothing`, () => {
  it.each([
    ['another customer', STRANGER, 404],
    ['a worker', { id: STRANGER.id, role: 'worker' as const }, 403],
    ['an admin', { id: CASE_ADMIN_ID, role: 'admin' as const }, 403],
  ])('%s gets no emergency reply while the confirmation is pending', async (_name, actor, status) => {
    const world = pendingWorld('hvac')
    const before = snapshot(world)

    const result = await world.send('Máy lạnh đang cháy', { as: actor })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 120)}`)
    expect(result.status, why).toBe(status)
    expect(snapshot(world), why).toEqual(before)
    expect(world.modelCalls, why).toEqual([])
  })

  it('refuses a stranger who tries to decide the booking, so the reply path is not a back door', async () => {
    const world = pendingWorld('hvac')
    const before = snapshot(world)

    const decided = await decide(world, 'confirmed', STRANGER)
    expect(decided.status, pillarWhy(PILLAR, JSON.stringify(decided.body).slice(0, 120))).toBe(404)
    expect(snapshot(world)).toEqual(before)
  })
})

describe(`${PILLAR.id}: a failed write is visible`, () => {
  it('returns an error and leaves the confirmation pending when the reply cannot be written', async () => {
    const world = pendingWorld('hvac')
    const client = world.db.client as unknown as { from: (table: string) => any }
    const original = client.from.bind(client)
    client.from = (table: string) => {
      const query = original(table)
      if (table !== 'kael_chat_turns') return query
      const failing = {
        select: () => failing,
        single: () => failing,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: { code: 'XX000', message: 'write failed' } }).then(resolve),
      }
      return {
        ...query,
        insert: (value: Record<string, unknown>) => (value.role === 'kael' ? failing : query.insert(value)),
      }
    }

    const result = await world.send('Máy lạnh đang cháy')
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 160)}`)
    expect(result.status, why).toBe(500)
    expect(confirmationOf(world).status, why).toBe('pending')
    expect(world.kaelTurns().filter((turn) => String(turn.text_content).includes('114')), why).toEqual([])
  })
})

describe(`${PILLAR.id}: the price_question chip does not drop an emergency`, () => {
  it('answers a reported emergency sent with the chip on a Case that has no pending confirmation', async () => {
    const world = createCaseWorld({ service: 'hvac', artifact: buildInitialDiagnosisScopeArtifact({ serviceType: 'hvac', customerGoal: 'Cần hỗ trợ' }), model: healthyModel })

    const result = await world.send('Máy lạnh đang cháy', { chip: 'price_question' })
    const why = pillarWhy(PILLAR, `status=${result.status} kael=${world.kaelTurns().length}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world).length, why).toBe(1)
    expect(world.modelCalls, why).toEqual([])
    expect(world.session().job_id, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('still ignores an ordinary price question on a Case with no pending confirmation, exactly as before', async () => {
    const world = createCaseWorld({ service: 'hvac', artifact: buildInitialDiagnosisScopeArtifact({ serviceType: 'hvac', customerGoal: 'Cần hỗ trợ' }), model: healthyModel })
    const before = snapshot(world)

    const result = await world.send('Giá sửa máy lạnh khoảng bao nhiêu?', { chip: 'price_question' })
    expect(result.status, pillarWhy(PILLAR, `status=${result.status}`)).toBe(200)
    expect(snapshot(world)).toEqual(before)
  })

  it('answers a reported emergency sent with the chip while the confirmation is pending', async () => {
    const world = pendingWorld('hvac')

    const result = await world.send('Máy lạnh đang cháy', { chip: 'price_question' })
    const why = pillarWhy(PILLAR, `status=${result.status} kael=${world.kaelTurns().length}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world).length, why).toBe(1)
    expect(confirmationOf(world).status, why).toBe('pending')
  })

  it('still ignores an ordinary price question exactly as before', async () => {
    const world = pendingWorld('hvac')
    const before = snapshot(world)

    const result = await world.send('Giá sửa máy lạnh khoảng bao nhiêu?', { chip: 'price_question' })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(snapshot(world), `${why} (the chip returns the read model and writes nothing)`).toEqual(before)
  })
})

// A fresh world with no session, the session-column defaults the real table applies, and an inert Case-to-conversation link
// (unrelated to safety, and it needs PostgREST calls the in-memory stand-in lacks), so the real create route can run.
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
    client_request_id: '40700000-0000-4000-8000-000000000001',
    language: 'vi',
    ...overrides,
  }
}

async function createCase(world: CaseWorld, body: Record<string, unknown>) {
  const response = await callerFor(world, OWNER)(new Request('https://edge.test/mobile-api/kael/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  return { status: response.status, body: await response.json() as Record<string, any> }
}

const createdConfirmation = (world: CaseWorld) =>
  ((world.db.tables.kael_chat_sessions[0]?.safe_metadata ?? {}) as Record<string, any>).intake_confirmation as Record<string, any> | undefined

describe(`${PILLAR.id}: a booking whose description reports an emergency`, () => {
  it.each(GENUINE)('%s: "%s" is answered when the booking is created, and the confirmation stays pending', async (service, description, route, number) => {
    const world = createWorld(service)

    const created = await createCase(world, bookingBody(service, { intake_description: description, message: description }))
    const why = pillarWhy(PILLAR, `${service}: status=${created.status} turns=${world.db.tables.kael_chat_turns.length}`)
    expect(created.status, why).toBeLessThan(300)
    expect(world.modelCalls, `${why} (no model for an emergency description)`).toEqual([])
    const replies = world.db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael')
    expect(replies.length, why).toBe(1)
    expect(String(replies[0]?.text_content), why).toContain(number)
    expect(replies[0]?.safe_metadata, why).toMatchObject({ emergency_route: route, safety_source: 'deterministic_emergency' })
    expect(createdConfirmation(world)?.status, `${why} (only the customer confirms the booking)`).toBe('pending')
    expect(world.db.tables.kael_chat_sessions[0]?.job_id ?? null, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('answers when only the typed description, not the message, reports the danger', async () => {
    const world = createWorld('electrical')

    const created = await createCase(world, bookingBody('electrical', { intake_description: 'Ổ cắm đang bốc khói', message: 'Cần thợ xem giúp thiết bị' }))
    const why = pillarWhy(PILLAR, `status=${created.status}`)
    expect(created.status, why).toBeLessThan(300)
    expect(world.db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael').length, why).toBe(1)
    expect(createdConfirmation(world)?.status, why).toBe('pending')
  })

  it('stays quiet for an ordinary booking, which waits for the customer exactly as before', async () => {
    const world = createWorld('hvac')

    const created = await createCase(world, bookingBody('hvac', {}))
    const why = pillarWhy(PILLAR, `status=${created.status}`)
    expect(created.status, why).toBeLessThan(300)
    expect(world.db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael'), why).toEqual([])
    expect(createdConfirmation(world)?.status, why).toBe('pending')
    expect(world.modelCalls, why).toEqual([])
  })

  it('does not answer twice when the same booking request is replayed', async () => {
    const world = createWorld('hvac')
    const body = bookingBody('hvac', { intake_description: 'Máy lạnh đang cháy trong phòng ngủ', message: 'Máy lạnh đang cháy trong phòng ngủ' })

    await createCase(world, body)
    await createCase(world, body)
    const why = pillarWhy(PILLAR, `sessions=${world.db.tables.kael_chat_sessions.length}`)
    expect(world.db.tables.kael_chat_sessions.length, why).toBe(1)
    expect(world.db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael').length, why).toBe(1)
  })

  it('repeats the guidance when the customer then confirms, ends the analysis, and still creates nothing', async () => {
    const world = createWorld('hvac')
    const created = await createCase(world, bookingBody('hvac', { intake_description: 'Máy lạnh đang cháy trong phòng ngủ', message: 'Máy lạnh đang cháy trong phòng ngủ' }))

    const decided = await decide(world, 'confirmed', OWNER, String(created.body.session.id))
    const why = pillarWhy(PILLAR, `status=${decided.status}`)
    expect(decided.status, why).toBe(200)
    expect(createdConfirmation(world)?.status, why).toBe('confirmed')
    expect(world.db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael' && (turn.safe_metadata as Record<string, unknown>).emergency_route === 'fire').length, why).toBe(2)
    expect(world.modelCalls, why).toEqual([])
    expect(world.db.tables.kael_chat_sessions[0]?.job_id ?? null, why).toBeNull()
  })

  it('answers the first message of a Case whose analysis the client deferred', async () => {
    const world = createWorld('hvac')

    const created = await createCase(world, {
      service_type: 'hvac',
      message: 'Máy lạnh đang cháy',
      problem_chips: [],
      photo_urls: [],
      defer_analysis: true,
      client_request_id: '40700000-0000-4000-8000-000000000002',
      language: 'vi',
    })
    const why = pillarWhy(PILLAR, `status=${created.status}`)
    expect(created.status, why).toBeLessThan(300)
    expect(world.db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael').length, why).toBe(1)
    expect(world.modelCalls, why).toEqual([])
  })
})

describe(`${PILLAR.id}: no route that advances a Case can skip the emergency gate`, () => {
  it('has every caller of advanceKaelChatEstimate resolve a Case emergency first', () => {
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
    const ungated = callers.filter((path) => !/\bresolveCaseEmergency\(/.test(readFileSync(path, 'utf8'))).map((path) => relative(root, path))
    const why = pillarWhy(PILLAR, `callers=${callers.map((path) => relative(root, path)).join(', ')}`)
    expect(callers.length, `${why} (the scan found the known callers)`).toBeGreaterThanOrEqual(4)
    expect(ungated, `${why} (a caller that advances a Case without the gate)`).toEqual([])
  })
})

describe(`${PILLAR.id}: evidence submitted while the booking confirmation is pending`, () => {
  async function submitEvidence(world: CaseWorld, body: Record<string, unknown>, actor: Actor = OWNER) {
    const response = await callerFor(world, actor)(new Request(`https://edge.test/mobile-api/kael/chat/${CASE_SESSION_ID}/evidence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'vi', ...body }),
    }))
    return { status: response.status, body: await response.json() as Record<string, any> }
  }

  it('answers an emergency in the message and leaves the confirmation pending', async () => {
    const world = pendingWorld('hvac')
    const confirmationBefore = clone(confirmationOf(world))

    const result = await submitEvidence(world, { decision: 'skipped', skip_reason: 'Không có ảnh', message: 'Máy lạnh đang cháy' })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 160)}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world).length, why).toBe(1)
    expect(confirmationOf(world), why).toEqual(confirmationBefore)
    expect(world.modelCalls, why).toEqual([])
    expect(world.session().job_id, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('answers an emergency in a reviewed voice transcript', async () => {
    const world = pendingWorld('hvac')

    const result = await submitEvidence(world, {
      decision: 'confirmed',
      evidence_items: [{ kind: 'voice_transcript', transcript: 'Máy lạnh đang cháy', model_eligible: true }],
    })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world).length, why).toBe(1)
    expect(confirmationOf(world).status, why).toBe('pending')
  })

  it('answers an emergency written in a reviewed text note', async () => {
    const world = pendingWorld('hvac')

    const result = await submitEvidence(world, {
      decision: 'confirmed',
      evidence_items: [{ kind: 'text_note', transcript: 'Máy lạnh đang cháy', model_eligible: true }],
    })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world).length, why).toBe(1)
    expect(confirmationOf(world).status, why).toBe('pending')
  })

  it('keeps the 409 for an ordinary submission and writes nothing', async () => {
    const world = pendingWorld('hvac')
    const before = snapshot(world)

    const result = await submitEvidence(world, { decision: 'skipped', skip_reason: 'Không có ảnh', message: 'Máy lạnh đang chạy nhưng không mát' })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 160)}`)
    expect(result.status, why).toBe(409)
    expect(JSON.stringify(result.body), why).toContain('INTAKE_CONFIRMATION_REQUIRED')
    expect(snapshot(world), why).toEqual(before)
  })

  it('refuses another customer without writing', async () => {
    const world = pendingWorld('hvac')
    const before = snapshot(world)

    const result = await submitEvidence(world, { decision: 'skipped', skip_reason: 'Không có ảnh', message: 'Máy lạnh đang cháy' }, STRANGER)
    expect(result.status, pillarWhy(PILLAR, JSON.stringify(result.body).slice(0, 120))).toBe(404)
    expect(snapshot(world)).toEqual(before)
  })
})

describe(`${PILLAR.id}: a gas leak reported while the booking is parked`, () => {
  it('answers a gas leak in a booking description even though the confirmation will block the unsupported stove', async () => {
    const world = createWorld('handyman')

    const created = await createCase(world, bookingBody('handyman', { intake_description: 'Bếp gas bị rò, nồng nặc mùi gas', message: 'Bếp gas bị rò, nồng nặc mùi gas' }))
    const why = pillarWhy(PILLAR, `status=${created.status}`)
    expect(created.status, why).toBeLessThan(300)
    const replies = world.db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael')
    expect(replies.length, why).toBe(1)
    expect(replies[0]?.safe_metadata, why).toMatchObject({ emergency_route: 'gas' })
    expect(String(replies[0]?.text_content), why).toContain('114')
    expect(createdConfirmation(world)?.status, why).toBe('pending')
    expect(world.modelCalls, why).toEqual([])
  })

  it('answers a gas smell typed while the confirmation is pending', async () => {
    const world = pendingWorld('handyman')

    const result = await world.send('Bếp gas bị rò, nồng nặc mùi gas')
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world).map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route), why).toEqual(['gas'])
    expect(confirmationOf(world).status, why).toBe('pending')
  })

  it('keeps refrigerant wording out of the emergency path while pending, so the 409 stays for it', async () => {
    const world = pendingWorld('hvac')
    const before = snapshot(world)

    const result = await world.send('Máy lạnh bị xì gas, cần nạp gas')
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(409)
    expect(snapshot(world), why).toEqual(before)
  })
})
