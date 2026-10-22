import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { STRANGER, installEdgeRuntimeTestHooks, type CaseWorld } from '../harness'
import { activeWorld, armWriteFailures, pendingWorld, type Service } from '../harness/emergency-fixtures'

export const PILLAR = {
  id: 'P420-kael-case-emergency-playbook-precedence',
  invariant:
    'enabling a service playbook never removes, suppresses or downgrades the shared gate guidance for a hazard the customer reports in the current turn: the route, the visible numbers and the structured metadata are the same with every playbook flag on as with every flag off, a safety signal persisted by an earlier turn never replaces the answer, the gate speaks once, a routine request that only names spark protection is not intercepted, and the Case, its owner and its business tables are untouched',
  authority: [
    'governance/RULES.md #7 (an emergency classification is not a workflow gate and never advances money-impacting state)',
    'governance/RULES.md #8 (a failed write is a visible error, never a fabricated success)',
    'KAWA_01 six-service diagnostic DX-03 (playbook flags replaced the gate with advice that carried no number)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/emergency-turn.ts',
  layer: 'integration',
  siblings: ['P406-kael-case-emergency-intake', 'P408-kael-case-emergency-all-fields', 'P409-kael-case-emergency-write-integrity'],
  mutation:
    'return null from resolveCaseEmergency whenever the flagged playbook has any advice for the Case: the plumbing, HVAC, stale-signal and write-failure rows turn red with the playbook flags on and stay green with them off',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const SERVICES: readonly Service[] = ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']
const FLAGS_ON = Object.fromEntries(SERVICES.map((service) => [`KAEL_PLAYBOOK_${service.toUpperCase()}_ENABLED`, 'true']))
const REQUIRED_NUMBERS: Record<string, readonly string[]> = {
  fire: ['114'],
  electrical_water: ['112', '114', '115'],
  medical: ['115'],
}
const NUMBER = /(?<!\d)(11[2-5])(?!\d)/g

type Hazard = {
  readonly id: string
  readonly service: Service
  readonly message: string
  readonly language: 'vi' | 'en'
  readonly voice?: string
  readonly route: 'fire' | 'electrical_water' | 'medical'
  readonly staleSignals?: readonly string[]
}

const HAZARDS: readonly Hazard[] = [
  { id: 'PLMB-S3', service: 'plumbing', language: 'vi', route: 'electrical_water', message: 'Ống nước trên trần vừa vỡ, nước chảy tràn xuống đúng chỗ hộp cầu dao và ổ điện, còn nghe tiếng xẹt xẹt.' },
  { id: 'HVAC-S3', service: 'hvac', language: 'en', route: 'fire', message: 'The air conditioner just exploded with a loud bang and thick black smoke is pouring out of the indoor unit.' },
  { id: 'UPHO-S4/4 with a stale persisted signal', service: 'upholstery', language: 'vi', route: 'fire', message: 'Mình gửi thêm giọng nói.', voice: 'Dây nối của máy hút bụi nóng chảy nhựa và bốc khói ngay cạnh tấm thảm.', staleSignals: ['bio_contamination'] },
  { id: 'ELEC-S3', service: 'electrical', language: 'vi', route: 'fire', message: 'Ổ điện cạnh bồn rửa chén bốc khói đen, có mùi khét và vừa nháy lửa mấy lần.' },
  { id: 'ELEC-S4/4', service: 'electrical', language: 'vi', route: 'electrical_water', message: 'Mình gửi thêm giọng nói.', voice: 'Tủ điện bây giờ nóng rát tay, có mùi khét và thấy tia lửa xẹt sau cánh tủ.' },
  { id: 'C2 price question over a smoking outlet', service: 'electrical', language: 'vi', route: 'fire', message: 'Cho mình hỏi giá sửa ổ điện, mà giờ cái ổ điện đang bốc khói và có lửa.' },
  { id: 'C3 plumbing Case, kitchen fire', service: 'plumbing', language: 'vi', route: 'fire', message: 'Căn hộ mình đang có lửa cháy ở phòng bếp, khói đen dày đặc.' },
  { id: 'CLEN-S3 chemical exposure', service: 'cleaning', language: 'vi', route: 'medical', message: 'Thợ dọn vừa trộn nước tẩy rửa với chất tẩy toilet, giờ hai người chóng mặt, khó thở, một người ngất rồi.' },
  { id: 'derived English plumbing hazard', service: 'plumbing', language: 'en', route: 'electrical_water', message: 'A ceiling pipe just burst and water is pouring onto the breaker box and an outlet, and I can hear sparking.' },
]

const numbersOf = (text: string) => [...new Set([...text.matchAll(NUMBER)].map((match) => match[1] as string))].sort()

async function observe(hazard: Hazard, flags: 'off' | 'on', options: { failReplyInserts?: number } = {}) {
  const world = activeWorld(hazard.service, { env: flags === 'on' ? FLAGS_ON : {} })
  if (hazard.staleSignals) {
    world.session().safe_metadata = { ...world.session().safe_metadata, intake_safety_signals: [...hazard.staleSignals] }
  }
  if (options.failReplyInserts) armWriteFailures(world, { replyInserts: options.failReplyInserts })
  return { world, ...(await send(world, hazard)) }
}

async function send(world: CaseWorld, hazard: Hazard) {
  const turnsBefore = world.db.tables.kael_chat_turns.length
  const result = await world.request('', {
    message: hazard.message,
    language: hazard.language,
    ...(hazard.voice ? { evidence_items: [{ kind: 'voice_transcript', transcript: hazard.voice, model_eligible: true }] } : {}),
  })
  const fresh = world.db.tables.kael_chat_turns.slice(turnsBefore).filter((turn) => turn.role === 'kael')
  const errorText = typeof result.body.error === 'string' ? result.body.error : ''
  const visible = [...fresh.map((turn) => String(turn.text_content ?? '')), errorText].join('\n')
  const metadataRoutes = fresh
    .map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route)
    .filter((route): route is string => typeof route === 'string')
  const structured = (result.body.emergency as { route?: string } | undefined)?.route ?? null
  return { result, fresh, visible, numbers: numbersOf(visible), metadataRoutes, structured }
}

describe(`${PILLAR.id}: the gate answers the current hazard with every playbook flag on`, () => {
  it.each(HAZARDS)('$id: route, visible numbers and metadata match the flags-off answer', async (hazard) => {
    const off = await observe(hazard, 'off')
    const on = await observe(hazard, 'on')
    const required = REQUIRED_NUMBERS[hazard.route] ?? []
    const why = pillarWhy(PILLAR, `${hazard.id}: off=${off.result.status}/${off.numbers.join(',')}/${off.metadataRoutes.join(',')} on=${on.result.status}/${on.numbers.join(',')}/${on.metadataRoutes.join(',')}`)

    expect(off.result.status, `${why} (flags off answers in a 2xx)`).toBe(200)
    expect(on.result.status, `${why} (flags on answers in a 2xx)`).toBe(200)
    expect(on.metadataRoutes, `${why} (route correctness: the turn carries the gate route)`).toContain(hazard.route)
    expect(off.metadataRoutes, `${why} (route correctness with flags off)`).toContain(hazard.route)
    for (const number of required) expect(on.numbers, `${why} (visible guidance names ${number} with flags on)`).toContain(number)
    for (const number of off.numbers) expect(on.numbers, `${why} (flags on never drops ${number} that flags off delivered)`).toContain(number)
    expect(on.fresh.filter((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route !== undefined).length, `${why} (the gate speaks once)`).toBe(1)
    expect(on.world.unexpectedWrites().filter((write) => !write.startsWith('kael_voice_transcript=')), `${why} (no Job, quote, match or payment row; the reviewed voice transcript is evidence, not a business write)`).toEqual([])
    expect(on.world.session().job_id, why).toBeNull()
  })

  it.each(HAZARDS)('$id: no paragraph of the visible answer repeats with flags on', async (hazard) => {
    const on = await observe(hazard, 'on')
    for (const turn of on.fresh) {
      const sentences = String(turn.text_content ?? '').split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 24)
      expect(new Set(sentences).size, pillarWhy(PILLAR, `${hazard.id}: ${JSON.stringify(turn.text_content).slice(0, 200)}`)).toBe(sentences.length)
    }
  })
})

describe(`${PILLAR.id}: a safety signal an earlier turn persisted never replaces the answer`, () => {
  it('answers a smoking cable on an upholstery Case that already carries bio_contamination, instead of a price lookup', async () => {
    const hazard = HAZARDS.find((entry) => entry.id.startsWith('UPHO-S4')) as Hazard
    const on = await observe(hazard, 'on')
    const why = pillarWhy(PILLAR, `visible=${on.visible.slice(0, 220)}`)
    expect(on.numbers, why).toContain('114')
    expect(on.visible, `${why} (the reply is not a price lookup)`).not.toMatch(/tìm giá|cách đây không lâu/i)
    expect((on.world.session().safe_metadata as Record<string, unknown>).intake_safety_signals, `${why} (the gate stop neither extends nor clears what the Case already holds)`).toEqual(['bio_contamination'])
  })
})

describe(`${PILLAR.id}: a failed reply write does not silence the gate`, () => {
  const smoking = HAZARDS.find((entry) => entry.id.startsWith('C2')) as Hazard

  it.each(['off', 'on'] as const)('answers on the same request when one write fails once (flags %s)', async (flags) => {
    const observed = await observe(smoking, flags, { failReplyInserts: 1 })
    const why = pillarWhy(PILLAR, `flags=${flags} status=${observed.result.status} visible=${observed.visible.slice(0, 160)}`)
    expect(observed.result.status, why).toBe(200)
    expect(observed.numbers, why).toContain('114')
  })

  it.each(['off', 'on'] as const)('a write that keeps failing is a visible error carrying the guidance, and the retry delivers it (flags %s)', async (flags) => {
    const first = await observe(smoking, flags, { failReplyInserts: 2 })
    const why = pillarWhy(PILLAR, `flags=${flags} first=${first.result.status} visible=${first.visible.slice(0, 160)}`)
    expect(first.result.status, `${why} (a failed write is not reported as success)`).toBeGreaterThanOrEqual(500)
    expect(first.numbers, `${why} (the error body carries the guidance)`).toContain('114')
    expect(first.structured, `${why} (the error body carries the structured emergency)`).not.toBeNull()
    const retry = await send(first.world, smoking)
    expect(retry.result.status, `${why} (retry)`).toBe(200)
    expect(retry.numbers, `${why} (retry)`).toContain('114')
  })
})

describe(`${PILLAR.id}: ordinary wording is not escalated by turning a playbook on`, () => {
  const ORDINARY: ReadonlyArray<readonly [Service, string]> = [
    ['electrical', 'Ổ cắm bị cháy từ tuần trước, nhờ thợ thay'],
    ['electrical', 'Hôm qua tủ điện có tia lửa nhưng thợ đã sửa xong, nhờ kiểm tra lại'],
    ['electrical', 'Tủ điện không có tia lửa, chỉ cần kiểm tra định kỳ'],
    ['plumbing', 'Nước đang chảy ra từ vòi'],
    ['hvac', 'Máy lạnh đang chạy nhưng không mát'],
    ['upholstery', 'Sofa có vết cháy thuốc lá'],
    ['handyman', 'Bếp gas có lửa yếu, nhờ thợ xem'],
  ]

  it.each(ORDINARY)('%s: "%s" produces no emergency turn with every flag on', async (service, message) => {
    const world = activeWorld(service, { env: FLAGS_ON })
    const result = await world.request('', { message, language: 'vi' })
    const emergencyTurns = world.kaelTurns().filter((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route !== undefined)
    expect(emergencyTurns, pillarWhy(PILLAR, `${service}: status=${result.status}`)).toEqual([])
  })
})

describe(`${PILLAR.id}: a request that only names spark protection is not a hazard report`, () => {
  const ROUTINE = [
    { service: 'electrical', message: 'Nhờ lắp ổ cắm chống tia lửa cho bếp.', language: 'vi' },
    { service: 'electrical', message: 'Please replace the spark-proof outlet cover.', language: 'en' },
    { service: 'handyman', message: 'Cần thay công tắc hạn chế tia lửa trong phòng khách.', language: 'vi' },
  ] as const

  it.each(ROUTINE.flatMap((row) => (['off', 'on'] as const).map((flags) => ({ ...row, flags }))))(
    '$service: "$message" produces no emergency turn on an active Case (flags $flags)',
    async ({ service, message, language, flags }) => {
      const world = activeWorld(service, { env: flags === 'on' ? FLAGS_ON : {} })
      const result = await world.request('', { message, language })
      const why = pillarWhy(PILLAR, `${service} flags=${flags} status=${result.status}`)
      const emergencyTurns = world.kaelTurns().filter((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route !== undefined)
      expect(emergencyTurns, why).toEqual([])
      expect((result.body as { emergency?: unknown }).emergency, `${why} (no structured emergency on the body)`).toBeUndefined()
    },
  )

  it.each(ROUTINE)('$service: "$message" on a Case waiting for the booking confirmation keeps the 409 and writes nothing', async ({ service, message, language }) => {
    const world = pendingWorld(service)
    const rows = world.db.tables.kael_chat_turns.length
    const result = await world.request('', { message, language })
    const why = pillarWhy(PILLAR, `${service} status=${result.status}`)
    expect(result.status, `${why} (an ordinary message is refused while the confirmation is pending)`).toBe(409)
    expect(world.db.tables.kael_chat_turns.length, `${why} (no row was written)`).toBe(rows)
  })

  it('still answers a real spark on a Case waiting for the booking confirmation, and leaves the booking pending', async () => {
    const world = pendingWorld('electrical')
    const result = await world.request('', { message: 'Nhờ lắp ổ cắm chống tia lửa cho bếp. Nhưng ổ cắm cũ vừa có tia lửa xẹt ra, nóng rát tay.', language: 'vi' })
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    const routes = world.kaelTurns().map((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route).filter((route) => route !== undefined)
    expect(result.status, why).toBe(200)
    expect(routes, why).toEqual(['electrical_water'])
    expect(world.session().job_id, why).toBeNull()
  })
})

describe(`${PILLAR.id}: authorization and Case state do not change`, () => {
  it.each(['off', 'on'] as const)('a stranger who sends a hazard to the owner Case writes nothing (flags %s)', async (flags) => {
    const world = activeWorld('plumbing', { env: flags === 'on' ? FLAGS_ON : {} })
    const rows = world.db.tables.kael_chat_turns.length
    const result = await world.request('', { message: HAZARDS[0]?.message, language: 'vi' }, { as: STRANGER })
    const why = pillarWhy(PILLAR, `flags=${flags} status=${result.status}`)
    expect([403, 404], why).toContain(result.status)
    expect(world.db.tables.kael_chat_turns.length, `${why} (no row was written for a stranger)`).toBe(rows)
    expect(JSON.stringify(result.body), `${why} (the refusal does not reveal the guidance of another customer's Case)`).not.toMatch(/11[2-5]/)
  })

  it('keeps an offer under review in place after the gate answers with every flag on', async () => {
    const world = activeWorld('hvac', { env: FLAGS_ON, status: 'estimate_ready' })
    world.session().case_phase = 'offer_review'
    const result = await world.request('', { message: 'Máy lạnh đang cháy', language: 'vi' })
    const why = pillarWhy(PILLAR, `status=${result.status} session=${String(world.session().status)}/${String(world.session().case_phase)}`)
    expect(result.status, why).toBe(200)
    expect(world.session().status, why).toBe('estimate_ready')
    expect(world.session().case_phase, why).toBe('offer_review')
    expect(world.session().job_id, why).toBeNull()
  })
})
