import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { CASE_SESSION_ID, installEdgeRuntimeTestHooks, type CaseWorld } from '../harness'
import { activeWorld, armWriteFailures, holdCustomerInserts, pendingWorld } from '../harness/emergency-fixtures'

export const PILLAR = {
  id: 'P409-kael-case-emergency-write-integrity',
  invariant:
    'an emergency reply that is cut short by a failed write, a retry or a concurrent duplicate never poisons the Case: turn indexes stay unique, a retry finishes what is already written instead of repeating it, the session counter matches the table, a failure is visible as an error and never as a fabricated success, and the reply never moves the Case or its offer time',
  authority: [
    'governance/RULES.md #8 (a refusal or a failed write is visible, never a fabricated success)',
    'governance/RULES.md #7 (an emergency reply never confirms, creates or advances money-impacting state)',
    'KAWA_01_Foundation_Safety_Evaluation.pdf W01 (Case intake emergency coverage)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/emergency-turn.ts',
  layer: 'integration',
  siblings: ['P408-kael-case-emergency-all-fields', 'P407-kael-case-emergency-pending-confirmation'],
  mutation:
    'insert the customer turn at the session counter instead of the table tail, skip the reuse of a stranded customer turn, or write the status back after the reply: the retry, orphan and offer-time rows turn red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const FIRE = 'Máy lạnh đang cháy'

const rowsOf = (world: CaseWorld) => world.db.tables.kael_chat_turns
const roles = (world: CaseWorld) => rowsOf(world).map((turn) => String(turn.role))
const indexes = (world: CaseWorld) => rowsOf(world).map((turn) => Number(turn.turn_index))
const customerTurns = (world: CaseWorld) => rowsOf(world).filter((turn) => turn.role === 'customer')
const emergencyReplies = (world: CaseWorld) =>
  world.kaelTurns().filter((turn) => (turn.safe_metadata as Record<string, unknown>).emergency_route === 'fire')

// The table holds a consistent, countable conversation: unique indexes, and a session counter that equals the
// highest turn index it holds.
function expectCountable(world: CaseWorld, why: string) {
  expect(new Set(indexes(world)).size, `${why} (the real table refuses a duplicate turn index)`).toBe(indexes(world).length)
  expect(world.session().total_turns, `${why} (the session counts every turn the table holds)`).toBe(Math.max(...indexes(world)))
}

describe(`${PILLAR.id}: a write cut short does not poison the Case`, () => {
  it('finishes what a failed attempt already wrote, instead of repeating it, when the request is retried', async () => {
    const world = pendingWorld('hvac')
    armWriteFailures(world, { sessionUpdates: 2 })

    const first = await world.send(FIRE)
    expect(first.status, pillarWhy(PILLAR, `first status=${first.status}`)).toBe(500)

    const retry = await world.send(FIRE)
    const why = pillarWhy(PILLAR, `retry status=${retry.status} roles=${roles(world).join(',')}`)
    expect(retry.status, `${why} (the retry must not collide with what the failed attempt left)`).toBe(200)
    expect(customerTurns(world).filter((turn) => String(turn.text_content).includes(FIRE)).length, `${why} (one record of what the customer said)`).toBe(1)
    expect(emergencyReplies(world).length, `${why} (one reply)`).toBe(1)
    expectCountable(world, why)
    expect(world.modelCalls, why).toEqual([])
  })

  it('reuses the customer turn a failed reply left behind, so the customer is not recorded twice', async () => {
    const world = pendingWorld('hvac')
    armWriteFailures(world, { replyInserts: 2 })

    const first = await world.send(FIRE)
    expect(first.status, pillarWhy(PILLAR, `first status=${first.status}`)).toBe(500)
    expect(emergencyReplies(world), pillarWhy(PILLAR, 'no reply was written, so none is claimed')).toEqual([])

    const retry = await world.send(FIRE)
    const why = pillarWhy(PILLAR, `retry status=${retry.status} roles=${roles(world).join(',')}`)
    expect(retry.status, why).toBe(200)
    expect(customerTurns(world).filter((turn) => String(turn.text_content).includes(FIRE)).length, why).toBe(1)
    expect(emergencyReplies(world).length, why).toBe(1)
    expectCountable(world, why)
  })

  it('answers on the same request when a single write fails once, with nothing repeated', async () => {
    const world = pendingWorld('hvac')
    armWriteFailures(world, { replyInserts: 1 })

    const result = await world.send(FIRE)
    const why = pillarWhy(PILLAR, `status=${result.status} roles=${roles(world).join(',')}`)
    expect(result.status, why).toBe(200)
    expect(customerTurns(world).filter((turn) => String(turn.text_content).includes(FIRE)).length, why).toBe(1)
    expect(emergencyReplies(world).length, why).toBe(1)
    expectCountable(world, why)
  })

  it('heals a session whose table holds turns the counter never counted', async () => {
    const world = pendingWorld('hvac')
    const counted = Number(world.session().total_turns)
    world.db.tables.kael_chat_turns.push({
      id: 'stranded-1',
      session_id: CASE_SESSION_ID,
      turn_index: counted + 1,
      role: 'kael',
      content_type: 'clarification',
      text_content: 'Một câu trả lời mà lần ghi trước chưa kịp tính',
      media_refs: [],
      safe_metadata: {},
      created_at: '2026-10-20T00:00:00.000Z',
    })

    const result = await world.send(FIRE)
    const why = pillarWhy(PILLAR, `status=${result.status} indexes=${indexes(world).join(',')}`)
    expect(result.status, `${why} (a stranded row must not make every later emergency a 500)`).toBe(200)
    expect(emergencyReplies(world).length, why).toBe(1)
    expectCountable(world, why)
  })
})

describe(`${PILLAR.id}: concurrent duplicates`, () => {
  it('answers two identical requests that both read the session before either writes, without a lost reply or a broken turn order', async () => {
    const world = pendingWorld('hvac')
    holdCustomerInserts(world)

    const [one, two] = await Promise.all([world.send(FIRE), world.send(FIRE)])
    const why = pillarWhy(PILLAR, `statuses=${one.status},${two.status} roles=${roles(world).join(',')}`)
    expect([one.status, two.status], `${why} (neither customer is told to try again)`).toEqual([200, 200])
    expect(emergencyReplies(world).length, `${why} (the customer holds a reply)`).toBeGreaterThanOrEqual(1)
    expect(customerTurns(world).filter((turn) => String(turn.text_content).includes(FIRE)).length, `${why} (every recorded report has its reply)`).toBe(emergencyReplies(world).length)
    expectCountable(world, why)
    expect(world.modelCalls, why).toEqual([])
    expect(world.unexpectedWrites(), why).toEqual([])
  })
})

describe(`${PILLAR.id}: the reply writes little and moves nothing`, () => {
  it('writes the two turns and updates the session once', async () => {
    const world = pendingWorld('hvac')
    const counts = armWriteFailures(world, {})

    const result = await world.send(FIRE)
    const why = pillarWhy(PILLAR, `status=${result.status} counts=${JSON.stringify(counts)}`)
    expect(result.status, why).toBe(200)
    expect(counts.turnInserts, `${why} (what the customer said, then one reply)`).toBe(2)
    expect(counts.sessionUpdates, `${why} (one counter update is the only session write, so there is no half-done state to retry)`).toBe(1)
  })

  it.each([
    ['active', undefined],
    ['collecting_evidence', undefined],
    ['estimate_ready', '2026-10-19T10:00:00.000Z'],
  ])('leaves a Case in status %s, its phase and its offer time exactly as they were', async (status, offerTime) => {
    const world = activeWorld('hvac', { status, sessionPatch: { case_phase: 'offer_review', estimate_ready_at: offerTime ?? null } })
    const before = { status: world.session().status, phase: world.session().case_phase, offer: world.session().estimate_ready_at, scope: JSON.stringify(world.session().diagnosis_scope) }

    const result = await world.send(FIRE)
    const why = pillarWhy(PILLAR, `status=${result.status}`)
    expect(result.status, why).toBe(200)
    expect({ status: world.session().status, phase: world.session().case_phase, offer: world.session().estimate_ready_at, scope: JSON.stringify(world.session().diagnosis_scope) }, why).toEqual(before)
  })

  it('shows a reply that cannot be written as an error, claims nothing, and leaves the counter where it was', async () => {
    const world = pendingWorld('hvac')
    const counted = world.session().total_turns
    armWriteFailures(world, { replyInserts: 99 })

    const result = await world.send(FIRE)
    const why = pillarWhy(PILLAR, `status=${result.status} roles=${roles(world).join(',')}`)
    expect(result.status, why).toBe(500)
    expect(emergencyReplies(world), why).toEqual([])
    expect(world.session().total_turns, `${why} (nothing is counted that was not completed)`).toBe(counted)
    expect(((world.session().safe_metadata as Record<string, any>).intake_confirmation).status, why).toBe('pending')
    expect(world.modelCalls, why).toEqual([])
  })
})
