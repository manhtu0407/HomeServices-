import { beforeEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { HCMC_SCHEDULE_VALIDATION_MESSAGE } from '../../../../../../supabase/functions/mobile-api/_shared/platform/scheduling'
import { emergencyReadingWithoutContext } from '../../../../../../supabase/functions/mobile-api/_shared/kael/agents/customer-assistant-answer'
import { __resetRateLimitStoreForTests } from '../../../../../../supabase/functions/mobile-api/_shared/platform/rate-limit'
import {
  OWNER,
  STRANGER,
  installEdgeRuntimeTestHooks,
  type CaseWorld,
} from '../harness'
import { activeWorld, newCaseWorld, pendingWorld } from '../harness/emergency-fixtures'
import {
  CUSTOMER,
  CONVERSATION,
  assistantSetup,
  exhaustAssistantQuota,
  normalChatSetup,
  providerSpy,
} from '../harness/normal-chat-world'

export const PILLAR = {
  id: 'P412-kael-emergency-delivery',
  invariant:
    'a reported emergency reaches the customer through the response the shipped app renders: after authentication and ownership, a request that the Case cannot take only because of an unrelated field (an invalid schedule) is answered as a 2xx deterministic reply that applies nothing, and the normal-chat and assistant routes answer a clear emergency before any paid provider call, web search, memory summary, media consumption or rate-limit refusal; an ordinary request is refused or processed exactly as before and nobody gets guidance for a Case they do not own',
  authority: [
    'governance/RULES.md #7 (an emergency answer is not a workflow gate and never confirms, creates or advances money-impacting state)',
    'governance/RULES.md #8 (a refusal is visible; guidance the client cannot display is not delivered)',
    'governance/RULES.md #2 (no provider spend is needed to answer a deterministic emergency)',
    'KAWA_01_Foundation_Safety_Evaluation.pdf W01 (the gate runs before model generation) and W03 (observability)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/emergency-turn.ts',
  layer: 'integration',
  siblings: ['P411-kael-case-emergency-closure-paths', 'P409-kael-case-emergency-write-integrity', 'P252-kael-chat-http-roundtrip'],
  mutation:
    'refuse the invalid schedule before reading the text, restore the old order of media validation, memory summary, web search and rate limit ahead of the gate, or answer a stranger: the delivery rows turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
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

const snapshot = (world: CaseWorld) => clone({ session: world.session(), turns: world.db.tables.kael_chat_turns })
const routesOf = (world: CaseWorld) =>
  world.kaelTurns().map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route).filter((route) => route !== undefined)
const failureText = (result: { body: Record<string, any> }) => JSON.stringify(result.body)

beforeEach(() => {
  __resetRateLimitStoreForTests()
})

describe(`${PILLAR.id}: a turn that only an invalid schedule would refuse`, () => {
  it.each(GENUINE)('answers "%s" (%s) as a 2xx reply that names %s and applies no schedule', async (message, route, number) => {
    const world = activeWorld()
    const before = clone({ status: world.session().status, phase: world.session().case_phase, scope: world.session().diagnosis_scope })
    const turnsBefore = world.db.tables.kael_chat_turns.length

    const result = await world.request('', { message, language: 'vi', ...PAST })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 160)}`)
    expect(result.status, `${why} (the shipped app renders a 2xx reply and replaces a 4xx with generic copy)`).toBe(200)
    expect(routesOf(world), why).toEqual([route])
    expect(String(world.kaelTurns().at(-1)?.text_content), why).toContain(number)
    expect(world.db.tables.kael_chat_turns.slice(turnsBefore).map((turn) => turn.role), `${why} (what the customer said, then one reply)`).toEqual(['customer', 'kael'])
    expect(world.session().scheduled_at ?? null, `${why} (the invalid schedule is applied nowhere)`).toBeNull()
    expect(clone({ status: world.session().status, phase: world.session().case_phase, scope: world.session().diagnosis_scope }), `${why} (the Case is where it was)`).toEqual(before)
    expect(world.modelCalls, why).toEqual([])
    expect(world.session().job_id ?? null, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('reads a reviewed voice transcript on that turn the same way', async () => {
    const world = activeWorld()

    const result = await world.request('', {
      message: BENIGN,
      language: 'vi',
      evidence_items: [{ kind: 'voice_transcript', transcript: GAS, model_eligible: true }],
      ...PAST,
    })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(routesOf(world), why).toEqual(['gas'])
  })

  it('leaves a pending booking confirmation pending', async () => {
    const world = pendingWorld('hvac')

    const result = await world.request('', { message: GAS, language: 'vi', ...PAST })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(routesOf(world), why).toEqual(['gas'])
    expect((world.session().safe_metadata as Record<string, any>).intake_confirmation.status, why).toBe('pending')
    expect(world.session().job_id ?? null, why).toBeNull()
  })

  it('still refuses an ordinary turn with the unchanged message and writes nothing', async () => {
    const world = activeWorld()
    const before = snapshot(world)

    const result = await world.request('', { message: BENIGN, language: 'vi', ...PAST })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(400)
    expect(failureText(result), why).toContain(HCMC_SCHEDULE_VALIDATION_MESSAGE)
    expect(failureText(result), why).not.toContain('114')
    expect(snapshot(world), why).toEqual(before)
  })

  it('gives another customer the plain refusal, never the guidance, and writes nothing', async () => {
    const world = activeWorld()
    const before = snapshot(world)

    const result = await world.request('', { message: GAS, language: 'vi', ...PAST }, { as: STRANGER })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(400)
    expect(failureText(result), why).toContain(HCMC_SCHEDULE_VALIDATION_MESSAGE)
    expect(failureText(result), why).not.toContain('114')
    expect(snapshot(world), why).toEqual(before)
  })

  it.each(['confirmed', 'abandoned', 'unsupported'] as const)('keeps a %s Case closed: the refusal carries the guidance and nothing is written', async (status) => {
    const world = activeWorld('hvac', { status })
    const before = snapshot(world)

    const result = await world.request('', { message: GAS, language: 'vi', ...PAST })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(400)
    expect(failureText(result), why).toContain('114')
    expect(snapshot(world), why).toEqual(before)
  })
})

describe(`${PILLAR.id}: a new Case that only an invalid schedule would refuse`, () => {
  async function create(world: CaseWorld, body: Record<string, unknown>, as = OWNER) {
    const handler = createMobileApiHandler({
      authenticate: async () => ({
        success: true as const,
        user: { id: as.id },
        role: as.role,
        supabase: world.db.client,
        privilegedSupabase: world.db.client,
        userSupabase: world.db.client,
      }) as never,
      services: world.services,
    })
    const response = await handler(new Request('https://edge.test/mobile-api/kael/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service_type: 'hvac', language: 'vi', problem_chips: [], photo_urls: [], ...body }),
    }))
    return { status: response.status, body: await response.json() as Record<string, any> }
  }

  it.each(GENUINE)('answers "%s" (%s) with a created Case and a reply that names %s', async (message, route, number) => {
    const world = newCaseWorld()

    const result = await create(world, { message, ...PAST })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 160)}`)
    expect(result.status, `${why} (a 4xx would be shown as generic copy)`).toBeLessThan(300)
    expect(world.db.tables.kael_chat_sessions.length, why).toBe(1)
    expect(routesOf(world), why).toEqual([route])
    expect(String(world.kaelTurns().at(-1)?.text_content), why).toContain(number)
    expect(world.session().scheduled_at ?? null, `${why} (the invalid schedule is applied nowhere)`).toBeNull()
    expect(world.session().job_id ?? null, why).toBeNull()
    expect(world.modelCalls, why).toEqual([])
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('answers wiring advice the same way and runs no analysis', async () => {
    const world = newCaseWorld('electrical')

    const result = await create(world, { service_type: 'electrical', message: 'Ổ cắm tóe lửa khi cắm phích', ...PAST })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBeLessThan(300)
    expect(routesOf(world), why).toEqual(['electrical_water'])
    expect(world.modelCalls, `${why} (a request the schedule would have refused is not analysed)`).toEqual([])
  })

  it('still refuses an ordinary new Case with the unchanged message and creates nothing', async () => {
    const world = newCaseWorld()

    const result = await create(world, { message: BENIGN, ...PAST })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(400)
    expect(failureText(result), why).toContain(HCMC_SCHEDULE_VALIDATION_MESSAGE)
    expect(world.db.tables.kael_chat_sessions.length, why).toBe(0)
  })

  it('still refuses an invalid schedule for a worker or an admin without any guidance', async () => {
    for (const actor of [{ id: STRANGER.id, role: 'worker' as const }, { id: OWNER.id, role: 'admin' as const }]) {
      const world = newCaseWorld()
      const result = await create(world, { message: GAS, ...PAST }, actor)
      const why = pillarWhy(PILLAR, `role=${actor.role} status=${result.status}`)
      expect(result.status, why).toBe(403)
      expect(failureText(result), why).not.toContain('114')
      expect(world.db.tables.kael_chat_sessions.length, why).toBe(0)
    }
  })
})

describe(`${PILLAR.id}: the assistant answers a clear emergency before its rate limit`, () => {
  it.each(GENUINE)('answers "%s" (%s) after the quota is spent, with no provider', async (message, _route, number) => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { ask } = assistantSetup()
    exhaustAssistantQuota()

    const result = await ask({ message })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 160)}`)
    expect(result.status, `${why} (a 429 is shown as "try again later" while the danger is current)`).toBe(200)
    expect(String(result.body.answer), why).toContain(number)
    expect(provider.calls, why).toEqual([])
  })

  it('still refuses an ordinary question after the quota is spent', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { ask } = assistantSetup()
    exhaustAssistantQuota()

    const result = await ask({ message: 'Giá thay ổ cắm khoảng bao nhiêu?' })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(429)
    expect(provider.calls, why).toEqual([])
  })

  it('answers an emergency when AI is switched off and no provider is configured', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'KAEL_AI_KILL_SWITCH' ? 'true' : undefined } })
    const { ask } = assistantSetup()

    const result = await ask({ message: GAS })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 160)}`)
    expect(result.status, why).toBe(200)
    expect(String(result.body.answer), why).toContain('114')
    expect(provider.calls, why).toEqual([])
  })
})

describe(`${PILLAR.id}: normal chat answers a clear emergency before anything paid or refusable`, () => {
  it.each(GENUINE)('answers "%s" (%s) after the quota is spent, with no provider call', async (message, _route, number) => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { send, appended } = normalChatSetup({ prior: 30 })
    exhaustAssistantQuota()

    const result = await send({ message })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 200)}`)
    expect(provider.calls, `${why} (no summary, search or generation may run before a deterministic answer)`).toEqual([])
    expect(result.status, why).toBe(200)
    expect(appended()?.operations[0]?.[2], why).toMatchObject({
      p_conversation_id: CONVERSATION,
      p_customer_id: CUSTOMER,
      p_kael_text: expect.stringContaining(number),
      p_media_refs: [],
    })
  })

  it('does not wait for a web search or a memory summary before answering', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { send } = normalChatSetup({ prior: 30 })

    const result = await send({ message: 'Có mùi gas ở bếp, giá bình gas hiện nay bao nhiêu và nên gọi ai?' })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 200)}`)
    expect(provider.calls, why).toEqual([])
    expect(result.status, why).toBe(200)
  })

  it('answers an emergency that arrives with an unusable image reference and consumes no media', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { send, client, appended } = normalChatSetup()

    const result = await send({
      message: GAS,
      media_refs: [`supabase://kael-chat-media/${CUSTOMER}/kael-chat/model_vision/expired.jpg`],
    })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 200)}`)
    expect(client.calls.filter((call) => call.table.startsWith('rpc:consume')), `${why} (an emergency consumes no upload)`).toEqual([])
    expect(result.status, why).toBe(200)
    expect(appended()?.operations[0]?.[2], why).toMatchObject({ p_media_refs: [], p_kael_text: expect.stringContaining('114') })
  })

  it('answers an emergency when AI is switched off', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'KAEL_AI_KILL_SWITCH' ? 'true' : undefined } })
    const { send, appended } = normalChatSetup({ prior: 30 })

    const result = await send({ message: GAS })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(appended()?.operations[0]?.[2], why).toMatchObject({ p_kael_text: expect.stringContaining('114') })
    expect(provider.calls, why).toEqual([])
  })

  it.each([
    ['Nhà tôi đang cháy', 'certain'],
    [GAS, 'certain'],
    ['Có người đột nhập', 'certain'],
    ['Ổ cắm tóe lửa', 'certain'],
    ['Nhà mình bị xì gas', 'possible'],
    ['Máy lạnh nhà mình bị xì gas', 'none'],
    [BENIGN, 'none'],
  ])('reads "%s" as %s before the earlier conversation is known', (message, expected) => {
    const reading = emergencyReadingWithoutContext({ message, secrets: {} as never })
    expect(reading, pillarWhy(PILLAR, 'a report that depends on the service (a bare leak is refrigerant in an air-conditioning chat) is only "possible"')).toBe(expected)
  })

  it('still reads the stored conversation for a report that depends on the service, so a follow-up leak in an air-conditioning chat is not an alarm', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { send, appended } = normalChatSetup({ prior: 2 })

    const result = await send({ message: 'Vậy thì xì gas à?' })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 160)}`)
    const answer = String((appended()?.operations[0]?.[2] as { p_kael_text?: string } | undefined)?.p_kael_text ?? '')
    expect(provider.calls.length, `${why} (the ordinary path ran: the report was not answered as an emergency)`).toBeGreaterThan(0)
    expect(/\b11[2-5]\b/.test(answer), `${why} (the chat is about an air conditioner, so a bare leak is refrigerant: ${answer.slice(0, 100)})`).toBe(false)
  })

  it('skips the paid steps for a report that depends on the service, and lets the full check settle the answer', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { send, appended } = normalChatSetup({ prior: 30 })

    const result = await send({ message: 'Nhà mình bị xì gas' })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${failureText(result).slice(0, 160)}`)
    expect(provider.calls, `${why} (no summary or search waits ahead of a possible emergency)`).toEqual([])
    expect(result.status, why).toBe(200)
    expect(String((appended()?.operations[0]?.[2] as { p_kael_text?: string } | undefined)?.p_kael_text ?? ''), `${why} (a bare leak outside an air-conditioning chat is the 112 prompt)`).toContain('112')
  })
})

describe(`${PILLAR.id}: the early answer never outruns ownership, and an ordinary message keeps its old path`, () => {
  const JOB = 'c412abcd-0000-4000-8000-0000000000d1'
  const jobRow = (status: string, customerId = CUSTOMER) => ({
    data: { id: JOB, status, customer_id: customerId, worker_id: null, service_type: 'electrical', description: 'Sửa ổ cắm', address_district: 'q7', payment_status: null },
    error: null,
  })

  it.each(['cancelled', 'reviewed'] as const)('answers a reported emergency in a %s job and refuses an ordinary question as before', async (status) => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const emergency = await assistantSetup({ jobs: [jobRow(status)] }).ask({ surface: 'customer_case', job_id: JOB, message: GAS })
    const why = pillarWhy(PILLAR, `status=${emergency.status} body=${failureText(emergency).slice(0, 160)}`)
    expect(emergency.status, `${why} (a closed job status must not hide a danger)`).toBe(200)
    expect(String(emergency.body.answer), why).toContain('114')

    const ordinary = await assistantSetup({ jobs: [jobRow(status)] }).ask({ surface: 'customer_case', job_id: JOB, message: 'Giá thay ổ cắm khoảng bao nhiêu?' })
    expect(ordinary.status, pillarWhy(PILLAR, `status=${ordinary.status}`)).toBe(409)
    expect(provider.calls, why).toEqual([])
  })

  it('gives the plain 404 and no guidance for a job that belongs to someone else, even with the quota spent', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    exhaustAssistantQuota()

    const result = await assistantSetup({ jobs: [jobRow('cancelled', 'c412abcd-0000-4000-8000-0000000000ee')] })
      .ask({ surface: 'customer_case', job_id: JOB, message: GAS })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(404)
    expect(failureText(result), why).not.toContain('114')
    expect(provider.calls, why).toEqual([])
  })

  it('refuses a worker before reading the job or the text', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { client, ask } = assistantSetup({ jobs: [jobRow('cancelled')] }, 'worker')

    const result = await ask({ surface: 'customer_case', job_id: JOB, message: GAS })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(403)
    expect(failureText(result), why).not.toContain('114')
    expect(client.calls.filter((call) => call.table === 'jobs'), why).toEqual([])
  })

  it('refuses an admin on a customer\'s job before reading it, even for an emergency', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { client, ask } = assistantSetup({ jobs: [jobRow('worker_matched')] }, 'admin')

    const result = await ask({ surface: 'customer_case', job_id: JOB, message: GAS })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(403)
    expect(failureText(result), why).not.toContain('114')
    expect(client.calls.filter((call) => call.table === 'jobs'), `${why} (the role is checked before the job is read)`).toEqual([])
    expect(provider.calls, why).toEqual([])
  })

  it('gives the plain 404 and no guidance for a conversation that belongs to someone else', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { send, appended } = normalChatSetup({ foreign: true })
    exhaustAssistantQuota()

    const result = await send({ message: GAS })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(404)
    expect(failureText(result), why).not.toContain('114')
    expect(appended(), why).toBeUndefined()
    expect(provider.calls, why).toEqual([])
  })

  it('records a replayed emergency turn once: the stored exchange is returned and nothing is appended', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { send, appended } = normalChatSetup({ prior: 2, replay: true })

    const result = await send({ message: GAS })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(appended(), why).toBeUndefined()
    expect(provider.calls, why).toEqual([])
  })

  it('keeps the quota for an ordinary normal-chat message', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { send, appended } = normalChatSetup({ prior: 30 })
    exhaustAssistantQuota()

    const result = await send({ message: 'Giá thay ổ cắm khoảng bao nhiêu?' })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(429)
    expect(appended(), why).toBeUndefined()
  })

  it('still runs the summary and the model for an ordinary message, so the emergency rows prove an ordering and not an outage', async () => {
    const provider = providerSpy()
    vi.stubGlobal('fetch', provider.fetch)
    const { send } = normalChatSetup({ prior: 30 })

    await send({ message: 'Giá thay ổ cắm khoảng bao nhiêu?' })
    expect(provider.calls.length, pillarWhy(PILLAR, 'an ordinary turn reaches a provider')).toBeGreaterThan(0)
  })
})

describe(`${PILLAR.id}: known limits, stated so that a change to one is a decision`, () => {
  const create = async (world: CaseWorld, body: Record<string, unknown>) => {
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
      body: JSON.stringify({ service_type: 'hvac', language: 'vi', problem_chips: [], photo_urls: [], ...body }),
    }))
    return { status: response.status, body: await response.json() as Record<string, any> }
  }

  it('refuses a new Case over the per-minute quota even when its first message reports an emergency (owner decision pending)', async () => {
    const world = newCaseWorld()
    // The create quota is the database function check_kael_chat_rate; the stand-in approves every function unless told otherwise.
    const client = world.db.client as unknown as { rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown> }
    const approve = client.rpc.bind(client)
    client.rpc = async (name, args) => name === 'check_kael_chat_rate'
      ? { data: [{ allowed: false, reason: 'minute', minute_count: 6, hour_count: 6 }], error: null }
      : approve(name, args)

    const result = await create(world, { message: GAS })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(429)
    expect(world.db.tables.kael_chat_sessions.length, why).toBe(0)
  })
})

describe(`${PILLAR.id}: a Case that goes through a correction and a second hazard`, () => {
  it('answers each report on its own turn, takes a withdrawal as ordinary information, and never creates a Job', async () => {
    const world = activeWorld('plumbing')

    const first = await world.request('', { message: 'Mình cần thợ xem giúp vòi nước bị rỉ', language: 'vi' })
    const fire = await world.request('', { message: 'Nhà tôi đang cháy', language: 'vi' })
    const withdrawn = await world.request('', { message: 'Nhầm rồi, không cháy, chỉ là khói bếp thôi', language: 'vi' })
    const gas = await world.request('', { message: 'Giờ lại ngửi thấy mùi gas ở bếp', language: 'vi' })

    const why = pillarWhy(PILLAR, `statuses=${[first, fire, withdrawn, gas].map((turn) => turn.status).join(',')} routes=${routesOf(world).join(',')}`)
    expect([first.status, fire.status, withdrawn.status, gas.status], why).toEqual([200, 200, 200, 200])
    expect(routesOf(world), `${why} (the first turn and the withdrawal are not emergencies)`).toEqual(['fire', 'gas'])
    expect(world.session().job_id ?? null, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('keeps an offer under review in place when a hazard is reported after the quote was ready', async () => {
    const world = activeWorld('plumbing', { status: 'estimate_ready', sessionPatch: { case_phase: 'offer_review' } })
    const before = clone({ status: world.session().status, phase: world.session().case_phase })

    const result = await world.request('', { message: GAS, language: 'vi' })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(routesOf(world), why).toEqual(['gas'])
    expect(clone({ status: world.session().status, phase: world.session().case_phase }), `${why} (the offer stays under review; only the customer confirms it)`).toEqual(before)
    expect(world.session().job_id ?? null, why).toBeNull()
  })
})
