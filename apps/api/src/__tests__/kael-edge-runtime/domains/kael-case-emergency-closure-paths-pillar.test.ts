import { beforeEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { HCMC_SCHEDULE_VALIDATION_MESSAGE } from '../../../../../../supabase/functions/mobile-api/_shared/platform/scheduling'
import { __resetRateLimitStoreForTests } from '../../../../../../supabase/functions/mobile-api/_shared/platform/rate-limit'
import {
  CASE_ADMIN_ID,
  CASE_SESSION_ID,
  OWNER,
  STRANGER,
  installEdgeRuntimeTestHooks,
  type Actor,
  type CaseWorld,
} from '../harness'
import { activeWorld, armWriteFailures, newCaseWorld, pendingWorld } from '../harness/emergency-fixtures'

export const PILLAR = {
  id: 'P411-kael-case-emergency-closure-paths',
  invariant:
    'a reported emergency is never lost to a path that ends the request before the gate reads it: a create on an existing session with no typed message, an invalid schedule, a closed Case, or a write that fails. After authentication and ownership, such a request is answered with deterministic guidance through a response the contract already allows (the existing chat, or the same error code and status with the guidance in its message), writes nothing a closed or invalid request could not write, never confirms or moves the Case, asks no model, and an ordinary request is refused or ignored exactly as before; a classified emergency whose write fails leaves a redacted failure trace and still carries the guidance',
  authority: [
    'governance/RULES.md #7 (an emergency classification is not a workflow gate and never confirms, creates or advances money-impacting state)',
    'governance/RULES.md #8 (a refusal or a failed write is visible, never a fabricated success)',
    'governance/RULES.md #9 (logs carry ids, codes and safe metadata only, never raw chat text or PII)',
    'KAWA_01_Foundation_Safety_Evaluation.pdf W01 (Case intake emergency coverage) and W03 (observability)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/emergency-turn.ts',
  layer: 'integration',
  siblings: ['P408-kael-case-emergency-all-fields', 'P409-kael-case-emergency-write-integrity', 'P407-kael-case-emergency-pending-confirmation'],
  mutation:
    'answer only the typed message on a create with a session id, check the schedule or the closed status before the gate, drop the guidance from a refusal, write to a closed Case, or skip the failure trace: the voice-only, schedule, closed-Case and failure rows turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const voice = (transcript: string) => ({ kind: 'voice_transcript', transcript, model_eligible: true })
const BENIGN = 'Mình cần thợ xem giúp thiết bị trong căn hộ'
const GAS = 'Mình ngửi thấy mùi gas ở bếp'

const GENUINE: ReadonlyArray<readonly [string, string, string]> = [
  [GAS, 'gas', '114'],
  ['Ổ cắm đang bốc khói', 'fire', '114'],
  ['Chồng mình bị điện giật, nằm im không cử động', 'medical', '115'],
  ['Có người đột nhập vào nhà', 'police', '113'],
]

const PAST = {
  scheduled_at: '2020-01-01T02:00:00.000Z',
  schedule_window: { date: '2020-01-01', start: '09:00', end: '11:00', time_zone: 'Asia/Ho_Chi_Minh' },
}
const CLOSED = ['confirmed', 'abandoned', 'unsupported'] as const

const snapshot = (world: CaseWorld) => clone({ session: world.session(), turns: world.db.tables.kael_chat_turns })
const routesOf = (world: CaseWorld) =>
  world.kaelTurns().map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route).filter((route) => route !== undefined)

async function createOn(world: CaseWorld, body: Record<string, unknown>, actor: Actor = OWNER) {
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
  const response = await handler(new Request('https://edge.test/mobile-api/kael/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: CASE_SESSION_ID, service_type: 'hvac', language: 'vi', ...body }),
  }))
  return { status: response.status, body: await response.json() as Record<string, any> }
}

const failureText = (result: { body: Record<string, any> }) => JSON.stringify(result.body)
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

describe(`${PILLAR.id}: a create on an existing session with no typed message`, () => {
  it.each(GENUINE)('answers "%s" (%s) sent as a voice transcript alone', async (transcript, route, number) => {
    const world = activeWorld()
    const before = clone({ status: world.session().status, phase: world.session().case_phase, scope: world.session().diagnosis_scope })
    const turnsBefore = world.db.tables.kael_chat_turns.length

    const result = await createOn(world, { evidence_items: [voice(transcript)] })
    const why = pillarWhy(PILLAR, `status=${result.status} turns=${world.db.tables.kael_chat_turns.length}`)
    expect(result.status, why).toBe(201)
    expect(routesOf(world), why).toEqual([route])
    expect(String(world.kaelTurns().at(-1)?.text_content), why).toContain(number)
    expect(world.db.tables.kael_chat_turns.slice(turnsBefore).map((turn) => turn.role), `${why} (what the customer said, then one reply)`).toEqual(['customer', 'kael'])
    expect(world.modelCalls, why).toEqual([])
    expect(clone({ status: world.session().status, phase: world.session().case_phase, scope: world.session().diagnosis_scope }), `${why} (the Case is where it was)`).toEqual(before)
    expect(world.session().job_id ?? null, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('answers a danger written only in the booking description, with no message and no evidence', async () => {
    const world = activeWorld()

    const result = await createOn(world, { intake_description: 'Bếp nhà mình có mùi gas rất nồng từ sáng' })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 120)}`)
    expect(result.status, why).toBe(201)
    expect(routesOf(world), why).toEqual(['gas'])
    expect(world.modelCalls, why).toEqual([])
  })

  it('leaves an ordinary transcript exactly as it was: the chat is returned and nothing is written', async () => {
    const world = activeWorld()
    const before = snapshot(world)

    const result = await createOn(world, { evidence_items: [voice('Máy treo tường, hai bộ')] })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(201)
    expect(snapshot(world), why).toEqual(before)
    expect(world.modelCalls, why).toEqual([])
  })

  it('answers it while the booking confirmation is pending, and the confirmation stays pending', async () => {
    const world = pendingWorld('hvac')

    const result = await createOn(world, { evidence_items: [voice(GAS)] })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(201)
    expect(routesOf(world), why).toEqual(['gas'])
    expect((world.session().safe_metadata as Record<string, any>).intake_confirmation.status, why).toBe('pending')
    expect(world.session().job_id ?? null, why).toBeNull()
  })

  it('answers it even when the request also carries an invalid schedule, and applies no schedule', async () => {
    const world = activeWorld()

    const result = await createOn(world, { evidence_items: [voice(GAS)], ...PAST })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(201)
    expect(routesOf(world), why).toEqual(['gas'])
    expect(world.session().scheduled_at ?? null, `${why} (the invalid schedule is not applied)`).toBeNull()
  })

  it('keeps refusing an invalid schedule on an ordinary voice-only request', async () => {
    const world = activeWorld()
    const before = snapshot(world)

    const result = await createOn(world, { evidence_items: [voice('Máy treo tường, hai bộ')], ...PAST })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(400)
    expect(failureText(result), why).toContain(HCMC_SCHEDULE_VALIDATION_MESSAGE)
    expect(snapshot(world), why).toEqual(before)
  })

  it.each(CLOSED)('refuses a %s Case with the guidance in the same 409, and writes nothing', async (status) => {
    const world = activeWorld('hvac', { status })
    const before = snapshot(world)

    const result = await createOn(world, { evidence_items: [voice(GAS)] })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 160)}`)
    expect(result.status, why).toBe(409)
    expect(failureText(result), `${why} (the same code, now with the guidance)`).toContain('INVALID_STATUS')
    expect(failureText(result), why).toContain('114')
    expect(snapshot(world), `${why} (a closed Case is never written to)`).toEqual(before)
    expect(world.modelCalls, why).toEqual([])
  })

  it.each([
    ['another customer', STRANGER, 404],
    ['a worker', { id: STRANGER.id, role: 'worker' as const }, 403],
    ['an admin', { id: CASE_ADMIN_ID, role: 'admin' as const }, 403],
  ])('gives %s no guidance and no write for someone else\'s Case', async (_name, actor, status) => {
    const world = activeWorld()
    const before = snapshot(world)

    const result = await createOn(world, { evidence_items: [voice(GAS)] }, actor)
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(status)
    expect(failureText(result), why).not.toContain('114')
    expect(snapshot(world), why).toEqual(before)
    expect(world.modelCalls, why).toEqual([])
  })
})

describe(`${PILLAR.id}: a refusal never reveals more than the plain one to someone who does not own the Case`, () => {
  it.each([
    ['another customer', STRANGER],
    ['a missing Case', null],
  ])('keeps the plain 400 for %s sending an emergency with an invalid schedule on a create with a session id', async (_name, actor) => {
    const world = activeWorld()
    const before = snapshot(world)
    const sessionId = actor === null ? '39800000-0000-4000-8000-0000000000ff' : undefined

    const result = await createOn(world, { evidence_items: [voice(GAS)], ...PAST, ...(sessionId ? { session_id: sessionId } : {}) }, actor ?? OWNER)
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, `${why} (the schedule refusal, exactly as before)`).toBe(400)
    expect(failureText(result), why).toContain(HCMC_SCHEDULE_VALIDATION_MESSAGE)
    expect(failureText(result), why).not.toContain('114')
    expect(snapshot(world), why).toEqual(before)
  })

  it('keeps the plain 404 for a missing Case on a voice-only create with a valid schedule', async () => {
    const world = activeWorld()

    const result = await createOn(world, { evidence_items: [voice(GAS)], session_id: '39800000-0000-4000-8000-0000000000ff' })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(404)
    expect(failureText(result), why).not.toContain('114')
  })
})

describe(`${PILLAR.id}: an invalid schedule does not hide an emergency`, () => {
  it('answers a turn whose message reports a danger as an ordinary reply that applies no schedule', async () => {
    const world = activeWorld()
    const turnsBefore = world.db.tables.kael_chat_turns.length

    const result = await world.request('', { message: 'Ổ cắm đang bốc khói', language: 'vi', ...PAST })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 160)}`)
    expect(result.status, `${why} (the app shows a 2xx reply; a 4xx becomes generic copy)`).toBe(200)
    expect(routesOf(world), why).toEqual(['fire'])
    expect(String(world.kaelTurns().at(-1)?.text_content), why).toContain('114')
    expect(world.db.tables.kael_chat_turns.slice(turnsBefore).map((turn) => turn.role), why).toEqual(['customer', 'kael'])
    expect(world.session().scheduled_at ?? null, `${why} (the invalid schedule is applied nowhere)`).toBeNull()
    expect(world.modelCalls, why).toEqual([])
  })

  it('reads a voice transcript on that turn the same way', async () => {
    const world = activeWorld()

    const result = await world.request('', { message: BENIGN, language: 'vi', evidence_items: [voice(GAS)], ...PAST })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(routesOf(world), why).toEqual(['gas'])
    expect(String(world.kaelTurns().at(-1)?.text_content), why).toContain('114')
    expect(world.modelCalls, why).toEqual([])
  })

  it('refuses an ordinary turn with the unchanged message', async () => {
    const world = activeWorld()

    const result = await world.request('', { message: BENIGN, language: 'vi', ...PAST })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(400)
    expect(failureText(result), why).toContain(HCMC_SCHEDULE_VALIDATION_MESSAGE)
    expect(failureText(result), why).not.toContain('114')
  })

  it('gives another customer the plain refusal, never the guidance, and writes nothing', async () => {
    const world = activeWorld()
    const before = snapshot(world)

    const result = await world.request('', { message: 'Ổ cắm đang bốc khói', language: 'vi', ...PAST }, { as: STRANGER })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(400)
    expect(failureText(result), why).not.toContain('114')
    expect(snapshot(world), why).toEqual(before)
  })

  it('answers a new Case whose transcript reports a danger as an ordinary reply, with no schedule and no analysis', async () => {
    const world = newCaseWorld()

    const result = await createOn(world, {
      session_id: undefined,
      service_type: 'hvac',
      message: BENIGN,
      problem_chips: [],
      photo_urls: [],
      evidence_items: [voice(GAS)],
      ...PAST,
    })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 160)}`)
    expect(result.status, `${why} (the app shows a 2xx reply; a 4xx becomes generic copy)`).toBeLessThan(300)
    expect(world.db.tables.kael_chat_sessions.length, why).toBe(1)
    expect(routesOf(world), why).toEqual(['gas'])
    expect(world.session().scheduled_at ?? null, `${why} (the invalid schedule is applied nowhere)`).toBeNull()
    expect(world.modelCalls, why).toEqual([])
    // The customer's own reviewed transcript is stored with the Case; no Job, quote, match or payment is.
    expect(world.unexpectedWrites(), why).toEqual(['kael_voice_transcript=1'])
  })

  it('refuses an ordinary new Case with the unchanged message', async () => {
    const world = activeWorld()

    const result = await createOn(world, {
      session_id: undefined, service_type: 'hvac', message: BENIGN, problem_chips: [], photo_urls: [], ...PAST,
    })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(400)
    expect(failureText(result), why).not.toContain('114')
  })
})

describe(`${PILLAR.id}: a closed Case refuses with the guidance and stays closed`, () => {
  it.each(CLOSED)('turn on a %s Case', async (status) => {
    const world = activeWorld('hvac', { status })
    const before = snapshot(world)

    const emergency = await world.request('', { message: 'Ổ cắm đang bốc khói', language: 'vi' })
    const why = pillarWhy(PILLAR, `status=${emergency.status}`)
    expect(emergency.status, why).toBe(409)
    expect(failureText(emergency), why).toContain('INVALID_STATUS')
    expect(failureText(emergency), why).toContain('114')
    expect(snapshot(world), why).toEqual(before)

    const ordinary = await world.request('', { message: BENIGN, language: 'vi' })
    expect(ordinary.status, why).toBe(409)
    expect(failureText(ordinary), why).not.toContain('114')
    expect(world.modelCalls, why).toEqual([])
  })

  it.each(CLOSED)('evidence on a %s Case, including a transcript and a skip reason', async (status) => {
    const world = activeWorld('hvac', { status })
    const before = snapshot(world)

    const transcript = await world.request('/evidence', { language: 'vi', decision: 'confirmed', evidence_items: [voice(GAS)] })
    const skipped = await world.request('/evidence', { language: 'vi', decision: 'skipped', skip_reason: 'Có người đột nhập vào nhà' })
    const why = pillarWhy(PILLAR, `statuses=${transcript.status},${skipped.status}`)
    expect([transcript.status, skipped.status], why).toEqual([409, 409])
    expect(failureText(transcript), why).toContain('114')
    expect(failureText(skipped), why).toContain('113')
    expect(snapshot(world), why).toEqual(before)
  })

  it('gives another customer the plain 404 for a closed Case, never the guidance', async () => {
    const world = activeWorld('hvac', { status: 'abandoned' })

    const result = await world.request('', { message: 'Ổ cắm đang bốc khói', language: 'vi' }, { as: STRANGER })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(404)
    expect(failureText(result), why).not.toContain('114')
  })
})

describe(`${PILLAR.id}: a refusal that carries the guidance is traced without the words that triggered it`, () => {
  it('logs one redacted guidance-only trace for a closed Case, with no text and no actor pseudonym', async () => {
    const world = activeWorld('hvac', { status: 'abandoned' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await world.request('', { message: GAS, language: 'vi' }, { identity: IDENTITY })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(409)
    const logged = warn.mock.calls.filter((call) => call[0] === 'kael_turn_trace').map((call) => call[1] as Record<string, unknown>)
    expect(logged.length, why).toBe(1)
    expect(logged[0], why).toMatchObject({
      route: 'case_emergency',
      stage: 'emergency_gate',
      outcome: 'emergency_guidance_only',
      permission_reason: 'EMERGENCY_GAS',
      gate_entry: 'turn',
      correlation_id: expect.stringMatching(UUID),
    })
    const serialized = JSON.stringify(logged)
    expect(serialized, `${why} (no customer text)`).not.toContain('gas ở bếp')
    expect(serialized, why).not.toContain('actor_role_hash')
    expect(serialized, why).not.toContain(OWNER.id)
    warn.mockRestore()
  })
})

describe(`${PILLAR.id}: a classified emergency whose write fails`, () => {
  const traces = (warn: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> =>
    warn.mock.calls.filter((call: unknown[]) => call[0] === 'kael_turn_trace').map((call: unknown[]) => call[1] as Record<string, unknown>)

  it('still carries the guidance in the error, and leaves a redacted failure trace', async () => {
    const world = pendingWorld('hvac')
    armWriteFailures(world, { sessionUpdates: 2 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await world.request('', { message: GAS, language: 'vi' }, { identity: IDENTITY })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 200)}`)
    expect(result.status, why).toBe(500)
    expect(failureText(result), `${why} (the guidance is not lost with the write)`).toContain('114')
    const logged = traces(warn)
    expect(logged.length, why).toBe(1)
    expect(logged[0], why).toMatchObject({
      schema: 'kael_turn_trace.v1',
      route: 'case_emergency',
      stage: 'emergency_gate',
      outcome: 'emergency_write_failed',
      permission_reason: 'EMERGENCY_GAS',
      gate_entry: 'turn',
      correlation_id: expect.stringMatching(UUID),
      edge_release_id: IDENTITY.releaseId,
      edge_deployment_id: IDENTITY.deploymentId,
      client_platform: 'ios',
      client_build_number: 57,
    })
    expect(logged[0]?.emergency_gate_version, `${why} (the gate version is recorded)`).toEqual(expect.stringMatching(/^[a-z][a-z0-9_.]{2,47}$/))
    const serialized = JSON.stringify(logged)
    expect(serialized, `${why} (no customer text)`).not.toContain('gas ở bếp')
    expect(serialized, `${why} (no actor pseudonym or identifier)`).not.toContain('actor_role_hash')
    expect(serialized, why).not.toContain(OWNER.id)
    warn.mockRestore()
  })

  it('carries the advice and a failure trace when the reply to advice-only wiring words cannot be written', async () => {
    const WIRING = 'Ổ cắm tóe lửa khi cắm phích'
    const reference = activeWorld('hvac')
    const answered = await reference.request('', { message: WIRING, language: 'vi' })
    expect(answered.status, pillarWhy(PILLAR, 'the reference request is answered')).toBe(200)
    const advice = String(reference.kaelTurns().find((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route === 'electrical_water')?.text_content)
    expect(advice.length, pillarWhy(PILLAR, 'the advice text exists')).toBeGreaterThan(20)

    const world = activeWorld('hvac')
    armWriteFailures(world, { replyInserts: 3 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const result = await world.request('', { message: WIRING, language: 'vi' }, { identity: IDENTITY })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 160)}`)
    expect(result.status, why).toBe(500)
    expect(String(result.body.error), `${why} (the advice itself is not lost with the write)`).toContain(advice)
    const logged = traces(warn)
    expect(logged.map((trace) => trace.outcome), why).toEqual(['emergency_write_failed'])
    expect(logged[0], why).toMatchObject({ permission_reason: 'EMERGENCY_ELECTRICAL_WATER', gate_entry: 'turn', correlation_id: expect.stringMatching(UUID) })
    warn.mockRestore()
  })

  it('does not fabricate a success: no emergency reply is claimed and the Case is unmoved', async () => {
    const world = pendingWorld('hvac')
    armWriteFailures(world, { replyInserts: 2 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await world.request('', { message: GAS, language: 'vi' })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(500)
    expect(routesOf(world), why).toEqual([])
    expect((world.session().safe_metadata as Record<string, any>).intake_confirmation.status, why).toBe('pending')
    warn.mockRestore()
  })

  it('leaves no failure trace when the emergency was answered, even after one retried write', async () => {
    const world = pendingWorld('hvac')
    armWriteFailures(world, { replyInserts: 1 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await world.request('', { message: GAS, language: 'vi' })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(traces(warn).map((trace) => trace.outcome), why).toEqual(['emergency_stop'])
    warn.mockRestore()
  })

  it('does not trace or alter a failing write for an ordinary request', async () => {
    const world = pendingWorld('hvac')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await world.request('', { message: BENIGN, language: 'vi' })
    expect(result.status, pillarWhy(PILLAR, `status=${result.status}`)).toBe(409)
    expect(traces(warn).filter((trace) => trace.route === 'case_emergency'), pillarWhy(PILLAR, 'no emergency trace')).toEqual([])
    warn.mockRestore()
  })
})
