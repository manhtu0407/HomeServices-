import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { buildInitialDiagnosisScopeArtifact, getKaelPerformanceProfile } from '../../../../../../supabase/functions/mobile-api/_shared/kael/index'
import { buildKaelIntakeConfirmation } from '../../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/intake-confirmation'
import {
  CASE_ADMIN_ID,
  OWNER,
  STRANGER,
  assistantReply,
  HVAC_UNIT_SLOT,
  classifierReply,
  createCaseWorld,
  installEdgeRuntimeTestHooks,
  unitAnswered,
  type CaseWorld,
  type ModelReplyFn,
} from '../harness'

export const PILLAR = {
  id: 'P406-kael-case-emergency-intake',
  invariant:
    'a reported fire, medical, police or unclear emergency in a Case is answered by deterministic Vietnam emergency guidance before any model call, boundary decline or pipeline step, whether or not a playbook flag is on; the Case keeps its owner, facts, offer and phase, and no Job, quote, match or payment is created; ordinary service wording continues through the normal intake',
  authority: [
    'governance/RULES.md #7 (an emergency classification is not a workflow gate and never creates or advances money-impacting state)',
    'governance/RULES.md #3 (the safety text is deterministic server copy, not raw model output)',
    'governance/RULES.md #8 (a failed write is a visible error, never a fabricated success)',
    'KAWA_01_Foundation_Safety_Evaluation.pdf W01 (Case intake emergency coverage, no flag bypass)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/emergency-turn.ts',
  layer: 'integration',
  siblings: ['P401-kael-emergency-routing', 'P405-kael-emergency-signal-matrix', 'P398-kael-recurring-incident-e2e'],
  mutation:
    'make resolveCaseEmergency return null, or gate it behind the playbook flag: the flag-off rows reach the pipeline, a model is called and the guidance row turns red',
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

function worldFor(service: Service, options: Parameters<typeof createCaseWorld>[0] = {}) {
  return createCaseWorld({
    service,
    artifact: buildInitialDiagnosisScopeArtifact({ serviceType: service, customerGoal: 'Cần hỗ trợ' }),
    model: healthyModel,
    ...options,
  })
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const emergencyTurns = (world: CaseWorld) =>
  world.kaelTurns().filter((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route !== undefined)
const caseIdentity = (world: CaseWorld) => {
  const scope = world.scope()
  return clone({ service_type: scope.service_type, facts: scope.facts, missing_facts: scope.missing_facts, evidence: scope.evidence })
}

const GENUINE: ReadonlyArray<readonly [Service, string, string, string]> = [
  ['electrical', 'Ổ cắm đang bốc khói', 'fire', '114'],
  ['plumbing', 'Ống nước vỡ và có người bị điện giật', 'medical', '115'],
  ['cleaning', 'Có người đột nhập vào nhà', 'police', '113'],
  ['hvac', 'Máy lạnh đang cháy', 'fire', '114'],
  ['upholstery', 'Ghế sofa đang cháy', 'fire', '114'],
  ['handyman', 'Thợ bị ngã bất tỉnh', 'medical', '115'],
]

const ORDINARY: ReadonlyArray<readonly [Service, string]> = [
  ['electrical', 'Ổ cắm bị cháy từ tuần trước, nhờ thợ thay'],
  ['plumbing', 'Nước đang chảy ra từ vòi'],
  ['cleaning', 'Dọn nhà sau vụ hỏa hoạn tuần trước'],
  ['hvac', 'Máy lạnh đang chạy nhưng không mát'],
  ['upholstery', 'Sofa có vết cháy thuốc lá'],
  ['handyman', 'Bếp gas có lửa yếu, nhờ thợ xem'],
]

describe.each([
  ['playbook flags off', {} as Record<string, string>],
  ['every playbook flag on', Object.fromEntries(SERVICES.map((service) => [`KAEL_PLAYBOOK_${service.toUpperCase()}_ENABLED`, 'true']))],
])(`${PILLAR.id}: genuine emergencies stop the Case turn (%s)`, (_label, env) => {
  it.each(GENUINE)('%s: "%s" -> %s guidance naming %s, with no model call and no business write', async (service, message, route, number) => {
    // The flagged electrical path already carries its own critical guidance; it is covered below.
    if (service === 'electrical' && Object.keys(env).length > 0) return
    const world = worldFor(service, { env })
    const identity = caseIdentity(world)

    const result = await world.send(message)
    const why = pillarWhy(PILLAR, `${service}: status=${result.status} purposes=${result.purposes.join(',')} newTurns=${result.newTurns.length}`)
    expect(result.status, why).toBe(200)
    expect(result.calls, `${why} (a deterministic emergency reply asks no model)`).toEqual([])
    expect(world.modelCalls, why).toEqual([])
    const reply = world.kaelTurns().at(-1)
    expect(String(reply?.text_content), why).toContain(number)
    expect(reply?.content_type, why).toBe('analysis')
    expect(reply?.safe_metadata, why).toMatchObject({ emergency_route: route, safety_source: 'deterministic_emergency' })
    expect(result.newTurns.map((turn) => turn.role), `${why} (the customer turn and one reply)`).toEqual(['customer', 'kael'])
    expect(world.session().status, why).toBe('active')
    expect(world.session().job_id, `${why} (an emergency never creates a Job)`).toBeNull()
    expect(world.unexpectedWrites(), `${why} (no quote, match or payment row)`).toEqual([])
    expect(caseIdentity(world), `${why} (the Case keeps what the customer already told Kael)`).toEqual(identity)
  })
})

describe(`${PILLAR.id}: the emergency log line carries no identity or text`, () => {
  it('logs the route code only, never the session, the customer or the message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const world = worldFor('hvac')
      await world.send('Máy lạnh đang cháy, số điện thoại của tôi là 0901234567')

      const logged = JSON.stringify(warn.mock.calls)
      const why = pillarWhy(PILLAR, `log lines: ${logged.slice(0, 200)}`)
      expect(logged, `${why} (the line is the shared turn trace, not a free-form message)`).toContain('kael_turn_trace')
      expect(logged, why).toContain('"route":"case_emergency"')
      expect(logged, why).toContain('"permission_reason":"EMERGENCY_FIRE"')
      expect(logged, why).not.toContain('actor_role_hash')
      expect(logged, why).not.toContain(OWNER.id)
      expect(logged, why).not.toContain('39800000-0000-4000-8000-000000000001')
      expect(logged, why).not.toContain('0901234567')
      expect(logged, why).not.toContain('Máy lạnh')
    } finally {
      warn.mockRestore()
    }
  })
})

describe(`${PILLAR.id}: the flagged electrical path`, () => {
  it('does not say it twice: critical guidance from the playbook path is the only safety message', async () => {
    const world = worldFor('electrical', { env: { KAEL_PLAYBOOK_ELECTRICAL_ENABLED: 'true' } })

    const result = await world.send('Ổ cắm đang bốc khói')
    const why = pillarWhy(PILLAR, `status=${result.status} purposes=${result.purposes.join(',')}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world), `${why} (the gate defers to the structured path)`).toEqual([])
    const guided = world.kaelTurns().filter((turn) => String(turn.text_content).includes('114'))
    expect(guided.length, `${why} (exactly one reply carries the 114 guidance)`).toBe(1)
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('defers a smoke and sparking report to the HVAC flagged path instead of adding a second message', async () => {
    const world = worldFor('hvac', { env: { KAEL_PLAYBOOK_HVAC_ENABLED: 'true' } })

    const result = await world.send('Máy lạnh nhà mình bốc khói và có mùi khét, tia lửa điện ở ổ cắm')
    const why = pillarWhy(PILLAR, `status=${result.status} purposes=${result.purposes.join(',')}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world), `${why} (the flagged path owns the hazard reply)`).toEqual([])
    expect(result.purposes, `${why} (a safety turn is not routed through the classifier)`).not.toContain('deepseek:case_turn_intent')
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('still stops for a medical emergency, which the electrical playbook has no guidance for', async () => {
    const world = worldFor('electrical', { env: { KAEL_PLAYBOOK_ELECTRICAL_ENABLED: 'true' } })

    const result = await world.send('Có người bị điện giật và bất tỉnh')
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(world.modelCalls, why).toEqual([])
    expect(world.kaelTurns().at(-1)?.safe_metadata, why).toMatchObject({ emergency_route: 'medical' })
  })
})

describe(`${PILLAR.id}: ordinary wording continues through the normal intake`, () => {
  it.each(ORDINARY)('%s: "%s" is not treated as an emergency', async (service, message) => {
    const world = worldFor(service)

    const result = await world.send(message)
    const why = pillarWhy(PILLAR, `${service}: status=${result.status} purposes=${result.purposes.join(',')}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world), why).toEqual([])
    expect(result.calls.length, `${why} (the normal intake still runs)`).toBeGreaterThan(0)
  })

  it('does not stop the Case for generic urgency alone', async () => {
    const world = worldFor('plumbing')

    await world.send('Ống nước vỡ, cần hỗ trợ khẩn cấp')
    expect(emergencyTurns(world), pillarWhy(PILLAR, 'urgent is a priority, not a reported danger')).toEqual([])
  })
})

describe(`${PILLAR.id}: a wiring or water hazard advises, then the intake continues`, () => {
  it('adds the advisory and still asks the Case its next question when no playbook flag is on', async () => {
    const world = worldFor('electrical')

    const result = await world.send('Ổ cắm tóe lửa khi cắm phích')
    const why = pillarWhy(PILLAR, `status=${result.status} purposes=${result.purposes.join(',')}`)
    expect(result.status, why).toBe(200)
    const advisory = emergencyTurns(world)
    expect(advisory.map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route), why).toEqual(['electrical_water'])
    expect(String(advisory[0]?.text_content), why).toMatch(/114.*115.*112/)
    expect(result.calls.length, `${why} (the intake was not abandoned)`).toBeGreaterThan(0)
    expect(world.kaelTurns().length, `${why} (a reply follows the advisory)`).toBeGreaterThan(emergencyTurns(world).length)
  })
})

describe(`${PILLAR.id}: the Case keeps its offer, its blocker and its phase`, () => {
  it('leaves an offer under review in place after an emergency reply', async () => {
    const world = worldFor('hvac', { status: 'estimate_ready', casePhase: 'offer_review' })

    const result = await world.send('Máy lạnh đang cháy')
    const why = pillarWhy(PILLAR, `status=${result.status} session.status=${String(world.session().status)}`)
    expect(result.status, why).toBe(200)
    expect(world.session().status, why).toBe('estimate_ready')
    expect(world.session().case_phase, why).toBe('offer_review')
    expect(world.session().job_id, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('puts back the recorded quote blocker the incoming turn cleared', async () => {
    const world = createCaseWorld({ model: healthyModel })
    await world.seedPriceEvidenceGap()
    const before = clone({ blockers: world.scope().quote_blockers, next: world.scope().next_action })
    expect(before.blockers.length, 'the fixture records a blocker').toBeGreaterThan(0)

    await world.send('Máy lạnh đang cháy')
    const why = pillarWhy(PILLAR, `blockers=${JSON.stringify(world.scope().quote_blockers)}`)
    expect(world.scope().quote_blockers, why).toEqual(before.blockers)
    expect(world.scope().next_action, why).toEqual(before.next)
  })
})

describe(`${PILLAR.id}: the Case carries on after an emergency reply`, () => {
  it('stores the next answer as a fact and does not repeat the emergency', async () => {
    const world = createCaseWorld({ model: healthyModel })
    await world.send('Máy lạnh đang cháy')
    expect(emergencyTurns(world).length).toBe(1)

    const next = await world.send('2 máy treo tường 1HP.')
    const why = pillarWhy(PILLAR, `status=${next.status} purposes=${next.purposes.join(',')} facts=${JSON.stringify(world.scope().facts)}`)
    expect(next.status, why).toBe(200)
    expect(emergencyTurns(world).length, `${why} (an ordinary answer is not another emergency)`).toBe(1)
    expect(world.scope().facts[HVAC_UNIT_SLOT], why).toContain('1 máy')
    expect(world.session().job_id, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('takes a correction that withdraws the danger as ordinary information', async () => {
    const world = createCaseWorld({ model: healthyModel })
    await world.send('Máy lạnh đang cháy')

    const correction = await world.send('Xin lỗi, không có khói và không cháy, máy chỉ chạy ồn thôi')
    const why = pillarWhy(PILLAR, `status=${correction.status} purposes=${correction.purposes.join(',')}`)
    expect(correction.status, why).toBe(200)
    expect(emergencyTurns(world).length, why).toBe(1)
    expect(correction.calls.length, `${why} (the intake resumed)`).toBeGreaterThan(0)
  })
})

describe(`${PILLAR.id}: refused actors, replays, the kill switch and a failed write`, () => {
  it.each([
    ['another customer', STRANGER, 404],
    ['a worker', { id: STRANGER.id, role: 'worker' as const }, 403],
    ['an admin', { id: CASE_ADMIN_ID, role: 'admin' as const }, 403],
  ])('%s gets no emergency reply and writes nothing', async (_name, actor, status) => {
    const world = worldFor('electrical')
    const before = clone({ session: world.session(), turns: world.db.tables.kael_chat_turns })

    const result = await world.send('Ổ cắm đang bốc khói', { as: actor })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 120)}`)
    expect(result.status, why).toBe(status)
    expect(clone({ session: world.session(), turns: world.db.tables.kael_chat_turns }), why).toEqual(before)
    expect(world.modelCalls, why).toEqual([])
  })

  it('answers a repeated report each time without creating any business record', async () => {
    const world = worldFor('hvac')

    await world.send('Máy lạnh đang cháy')
    await world.send('Máy lạnh đang cháy')
    const why = pillarWhy(PILLAR, `kael turns=${world.kaelTurns().length}`)
    expect(emergencyTurns(world).length, why).toBe(2)
    expect(world.modelCalls, why).toEqual([])
    expect(world.session().job_id, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it('answers even when the AI kill switch is on', async () => {
    const world = worldFor('hvac', { env: { KAEL_AI_KILL_SWITCH: 'true' } })

    const result = await world.send('Máy lạnh đang cháy')
    expect(result.status, pillarWhy(PILLAR, 'kill switch')).toBe(200)
    expect(emergencyTurns(world).length).toBe(1)
    expect(world.modelCalls).toEqual([])
  })

  it('reports a failed reply write instead of pretending the guidance was delivered', async () => {
    const world = worldFor('hvac')
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
    expect(world.kaelTurns().filter((turn) => String(turn.text_content).includes('114')), why).toEqual([])
  })
})

describe(`${PILLAR.id}: confirming a booking intake whose description reports an emergency`, () => {
  it('answers with guidance at the confirmation boundary and starts no analysis', async () => {
    const world = worldFor('hvac')
    const profile = getKaelPerformanceProfile('hvac')
    const date = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const scheduledAt = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 9 - 7, 0)).toISOString()
    const confirmation = buildKaelIntakeConfirmation({
      actorId: OWNER.id,
      serviceType: 'hvac',
      profileId: profile!.id,
      description: 'Máy lạnh đang cháy trong phòng ngủ',
      problemChips: ['other_hvac'],
      addressLabel: 'Căn hộ thử nghiệm',
      addressDistrict: 'Quận 7',
      scheduledAt,
      scheduleWindow: { date, start: '09:00', end: '11:00', time_zone: 'Asia/Ho_Chi_Minh' },
      language: 'vi',
    } as never)
    expect(confirmation.blocking, 'the fixture confirmation must be confirmable').toBe(false)
    world.session().safe_metadata = { ...world.session().safe_metadata, intake_confirmation: confirmation }
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

    const response = await handler(new Request('https://edge.test/mobile-api/kael/chat/39800000-0000-4000-8000-000000000001/intake-confirmation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'confirmed' }),
    }))

    const why = pillarWhy(PILLAR, `status=${response.status} kael=${world.kaelTurns().length}`)
    expect(response.status, why).toBe(200)
    expect(world.modelCalls, `${why} (no model for an emergency description)`).toEqual([])
    expect(emergencyTurns(world).length, why).toBe(1)
    expect(String(emergencyTurns(world)[0]?.text_content), why).toContain('114')
    expect(world.session().job_id, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })
})

describe(`${PILLAR.id}: creating a Case with an emergency first message`, () => {
  it('answers the first message with guidance and starts no analysis, quote or Job', async () => {
    const world = worldFor('electrical')
    world.db.tables.kael_chat_sessions.length = 0
    world.db.tables.kael_chat_turns.length = 0
    // The Case-to-conversation link is unrelated to safety and uses PostgREST calls the in-memory stand-in lacks.
    const inert: unknown = new Proxy(function () {}, {
      get: (_target, property) => property === 'then'
        ? (resolve: (value: unknown) => unknown) => Promise.resolve({ data: { id: 'conversation-stub' }, error: null }).then(resolve)
        : () => inert,
      apply: () => inert,
    })
    const client = world.db.client as unknown as { from: (table: string) => unknown }
    const original = client.from.bind(client)
    // Column defaults the real table applies on insert; the in-memory stand-in does not.
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
      body: JSON.stringify({
        service_type: 'electrical',
        message: 'Ổ cắm đang bốc khói',
        problem_chips: [],
        photo_urls: [],
        client_request_id: '40600000-0000-4000-8000-000000000001',
        language: 'vi',
      }),
    }))

    const why = pillarWhy(PILLAR, `status=${response.status} turns=${world.db.tables.kael_chat_turns.length}`)
    expect(response.status, why).toBeLessThan(300)
    expect(world.modelCalls, `${why} (no model for an emergency first message)`).toEqual([])
    const kael = world.db.tables.kael_chat_turns.filter((turn) => turn.role === 'kael')
    expect(kael.length, why).toBe(1)
    expect(String(kael[0]?.text_content), why).toContain('114')
    expect(world.db.tables.kael_chat_sessions[0]?.job_id ?? null, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })
})

describe(`${PILLAR.id}: an emergency reported while submitting evidence`, () => {
  async function submitEvidence(world: CaseWorld, body: Record<string, unknown>, actor = OWNER) {
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
    const response = await handler(new Request('https://edge.test/mobile-api/kael/chat/39800000-0000-4000-8000-000000000001/evidence', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ language: 'vi', ...body }),
    }))
    return { status: response.status, body: await response.json() as Record<string, any> }
  }

  it.each(GENUINE)('%s: "%s" typed with a skipped evidence step -> %s guidance naming %s, with no flag and no model', async (service, message, route, number) => {
    const world = worldFor(service)
    const identity = caseIdentity(world)

    const result = await submitEvidence(world, { decision: 'skipped', skip_reason: 'Không có ảnh', message })
    const why = pillarWhy(PILLAR, `${service}: status=${result.status} body=${JSON.stringify(result.body).slice(0, 160)}`)
    expect(result.status, why).toBe(200)
    expect(world.modelCalls, `${why} (a deterministic emergency reply asks no model)`).toEqual([])
    const reply = world.kaelTurns().at(-1)
    expect(String(reply?.text_content), why).toContain(number)
    expect(reply?.safe_metadata, why).toMatchObject({ emergency_route: route, safety_source: 'deterministic_emergency' })
    expect(world.session().job_id, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
    expect(caseIdentity(world).service_type, why).toBe(identity.service_type)
  })

  it('answers an emergency spoken in a reviewed voice transcript', async () => {
    const world = worldFor('hvac')

    const result = await submitEvidence(world, {
      decision: 'confirmed',
      evidence_items: [{ kind: 'voice_transcript', transcript: 'Máy lạnh đang cháy', model_eligible: true }],
    })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 160)}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world).length, why).toBe(1)
    expect(world.modelCalls, why).toEqual([])
  })

  it('answers an emergency written in a reviewed text note', async () => {
    const world = worldFor('hvac')

    const result = await submitEvidence(world, {
      decision: 'confirmed',
      evidence_items: [{ kind: 'text_note', transcript: 'Máy lạnh đang cháy', model_eligible: true }],
    })
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 160)}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world).length, why).toBe(1)
    expect(world.modelCalls, why).toEqual([])
  })

  it('continues the normal evidence analysis when the message is ordinary', async () => {
    const world = worldFor('hvac')

    const result = await submitEvidence(world, { decision: 'skipped', skip_reason: 'Không có ảnh', message: 'Máy lạnh đang chạy nhưng không mát' })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world), why).toEqual([])
    expect(world.modelCalls.length, `${why} (the pipeline still ran)`).toBeGreaterThan(0)
  })

  it('refuses another customer without writing, and an emergency never creates a business record', async () => {
    const world = worldFor('hvac')
    const before = clone({ session: world.session(), turns: world.db.tables.kael_chat_turns })

    const refused = await submitEvidence(world, { decision: 'skipped', skip_reason: 'Không có ảnh', message: 'Máy lạnh đang cháy' }, STRANGER)
    expect(refused.status, pillarWhy(PILLAR, JSON.stringify(refused.body).slice(0, 120))).toBe(404)
    expect(clone({ session: world.session(), turns: world.db.tables.kael_chat_turns })).toEqual(before)

    const answered = await submitEvidence(world, { decision: 'skipped', skip_reason: 'Không có ảnh', message: 'Máy lạnh đang cháy' })
    expect(answered.status).toBe(200)
    expect(world.session().job_id).toBeNull()
    expect(world.unexpectedWrites()).toEqual([])
  })
})

describe(`${PILLAR.id}: fuel gas versus refrigerant in a Case`, () => {
  const GAS_GENUINE: ReadonlyArray<readonly [Service, string]> = [
    ['electrical', 'Đang sửa điện thì ngửi thấy mùi gas'],
    ['plumbing', 'Bình gas bị rò rỉ ngay cạnh bồn rửa'],
    ['cleaning', 'Lau bếp thì thấy bình gas bị rò'],
    ['hvac', 'Máy lạnh chạy bình thường nhưng bếp có mùi gas'],
    ['upholstery', 'Giặt sofa xong thấy mùi gas ở bếp'],
    ['handyman', 'Bếp gas bị rò, nồng nặc mùi gas'],
  ]

  it.each(GAS_GENUINE)('%s: "%s" gets the gas guidance naming 114, not an out-of-scope decline, and asks no model', async (service, message) => {
    const world = worldFor(service)

    const result = await world.send(message)
    const why = pillarWhy(PILLAR, `${service}: status=${result.status} purposes=${result.purposes.join(',')}`)
    expect(result.status, why).toBe(200)
    expect(world.modelCalls, why).toEqual([])
    expect(result.newTurns.map((turn) => turn.role), `${why} (what the customer said, then one reply)`).toEqual(['customer', 'kael'])
    const reply = world.kaelTurns().at(-1)
    expect(String(reply?.text_content), why).toContain('114')
    expect(reply?.safe_metadata, why).toMatchObject({ emergency_route: 'gas', safety_source: 'deterministic_emergency' })
    expect(world.session().status, why).toBe('active')
    expect(world.session().job_id, why).toBeNull()
    expect(world.unexpectedWrites(), why).toEqual([])
  })

  it.each([
    ['hvac', 'Máy lạnh bị xì gas, cần nạp gas'],
    ['hvac', 'Bị xì gas'],
    ['hvac', 'Điều hòa thiếu gas, cần bơm gas R32'],
    ['plumbing', 'Máy lạnh nhà mình rò gas, còn ống nước thì ổn'],
    ['handyman', 'Bếp gas có lửa yếu, nhờ thợ xem'],
    ['cleaning', 'Nhờ kiểm tra rò gas định kỳ cho bếp'],
  ] as const)('%s: "%s" is an ordinary request and continues through the normal intake', async (service, message) => {
    const world = worldFor(service)

    const result = await world.send(message)
    const why = pillarWhy(PILLAR, `${service}: status=${result.status} purposes=${result.purposes.join(',')}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world), why).toEqual([])
  })

  it('asks for 112 about a bare "xì gas" outside the HVAC service, where it could be either gas', async () => {
    const world = worldFor('cleaning')

    const result = await world.send('Bị xì gas')
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world).map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route), why).toEqual(['uncertain'])
    expect(String(emergencyTurns(world)[0]?.text_content), why).toContain('112')
    expect(world.modelCalls, why).toEqual([])
  })

  it('answers a gas leak even when the service would otherwise decline a gas stove as unsupported', async () => {
    const world = worldFor('handyman')

    const result = await world.send('Bếp gas bị rò, mùi gas nồng nặc')
    const why = pillarWhy(PILLAR, `status=${result.status} body=${JSON.stringify(result.body).slice(0, 120)}`)
    expect(result.status, why).toBe(200)
    expect(emergencyTurns(world).length, why).toBe(1)
    expect(world.session().status, `${why} (the Case is not abandoned or marked unsupported by the leak)`).toBe('active')
  })
})
