import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { ApiFailure } from '../../../../../../supabase/functions/mobile-api/_shared/platform/api-failure'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { CASE_SESSION_ID, OWNER, STRANGER, type Actor, type CaseWorld } from '../harness/case-world'
import { installEdgeRuntimeTestHooks } from '../harness/hooks'
import { activeWorld, evidenceWorld, armWriteFailures, newCaseWorld } from '../harness/emergency-fixtures'

export const PILLAR = {
  id: 'P416-kael-emergency-error-delivery',
  invariant: 'authorized recognized emergencies carry only versioned deterministic route metadata through JSON and SSE business failures without changing the rejection, crossing a confirmation gate, spending on providers or revealing private Case details to another actor',
  authority: [
    'governance/RULES.md #7 (customer approval gates remain authoritative)',
    'governance/RULES.md #8 (rejected operations remain visible failures)',
    'governance/RULES.md #9 (new metadata contains no private text or identifiers)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/emergency-turn.ts',
  layer: 'integration',
  siblings: ['P412-kael-emergency-delivery', 'P411-kael-case-emergency-closure-paths'],
  mutation: 'remove emergency error delivery: the real handler returns the same 400 VALIDATION for foreign media but the required versioned fire route is absent',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const FIRE = 'Nhà tôi đang cháy'
const photo = (owner = OWNER.id) => ({ kind: 'photo', ref: `supabase://kael-chat-media/${owner}/kael-chat/model_vision/expired.jpg`, model_eligible: true })

function handlerFor(world: CaseWorld, actor: Actor = OWNER) {
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

async function create(world: CaseWorld, input: Record<string, unknown>, actor = OWNER) {
  const response = await handlerFor(world, actor)(new Request('https://edge.test/mobile-api/kael/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ service_type: 'hvac', language: 'vi', problem_chips: [], photo_urls: [], ...input }),
  }))
  return { status: response.status, body: await response.json() as Record<string, unknown> }
}

describe(PILLAR.id, () => {
  it('preserves foreign media rejection and returns a trusted fire route without creating a Case', async () => {
    const world = newCaseWorld()
    const result = await create(world, { message: FIRE, evidence_items: [photo(STRANGER.id)] })
    const why = pillarWhy(PILLAR, `foreign new media status=${result.status}`)
    expect(result.status, why).toBe(400)
    expect(result.body, why).toMatchObject({ code: 'VALIDATION', error: expect.any(String) })
    expect(result.body.emergency, why).toEqual({ version: 'v1', route: 'fire' })
    expect(world.db.tables.kael_chat_sessions, why).toEqual([])
    expect(world.db.tables.kael_chat_turns, why).toEqual([])
    expect(world.modelCalls, why).toEqual([])
    expect(world.unexpectedWrites(), why).toEqual([])
    expect(vi.mocked(fetch), why).not.toHaveBeenCalled()
  })
})

const ARC = 'Ổ cắm tóe lửa khi cắm phích'
const snapshot = (world: CaseWorld) => JSON.stringify({ sessions: world.db.tables.kael_chat_sessions, turns: world.db.tables.kael_chat_turns })
function safeFailure(result: {status: number; body: Record<string, unknown>}, status: number, code: string, route: string) {
  expect(result.status, pillarWhy(PILLAR, code)).toBe(status)
  expect(result.body.code).toBe(code)
  expect(result.body.emergency).toEqual({ version: 'v1', route })
  expect(Object.keys(result.body.emergency as object).sort()).toEqual(['route', 'version'])
}
function noBusiness(world: CaseWorld) {
  expect(world.modelCalls).toEqual([])
  expect(world.unexpectedWrites()).toEqual([])
  expect(world.db.tables.kael_chat_sessions.every(row => !row.job_id)).toBe(true)
}

describe(PILLAR.id + ': fixed failure matrix', () => {
  it('missing upload intent stays 400 without a Case or evidence acceptance', async () => {
    const world = newCaseWorld(); const before = snapshot(world)
    safeFailure(await create(world, { message: FIRE, evidence_items: [photo()] }), 400, 'MEDIA_INTENT_INVALID', 'fire')
    expect(snapshot(world)).toBe(before); noBusiness(world)
  })
  it('malformed owner media stays rejected', async () => {
    const world = newCaseWorld(); const before = snapshot(world)
    safeFailure(await create(world, { message: FIRE, evidence_items: [{ ...photo(), ref: 'https://foreign.test/photo.jpg' }] }), 400, 'VALIDATION', 'fire')
    expect(snapshot(world)).toBe(before); noBusiness(world)
  })
  it('required evidence cannot be skipped by emergency advice', async () => {
    const world = evidenceWorld(); const before = snapshot(world)
    safeFailure(await world.request('/evidence', { language: 'vi', decision: 'skipped', skip_reason: ARC }), 409, 'EVIDENCE_REQUIRED', 'electrical_water')
    expect(snapshot(world)).toBe(before); noBusiness(world)
  })
  it('existing rejected evidence stays rejected without writes', async () => {
    const world = activeWorld(); const before = snapshot(world)
    safeFailure(await world.request('', { message: ARC, evidence_items: [photo()] }), 400, 'MEDIA_INTENT_INVALID', 'electrical_water')
    expect(snapshot(world)).toBe(before); noBusiness(world)
  })
  it.each(['confirmed', 'abandoned', 'unsupported'])('terminal %s is never reopened', async (status) => {
    const world = activeWorld('hvac', { status }); const before = snapshot(world)
    safeFailure(await world.request('', { message: FIRE }), 409, 'INVALID_STATUS', 'fire')
    expect(snapshot(world)).toBe(before); noBusiness(world)
  })
  it('reply persistence failure stays 500 with no business transition', async () => {
    const world = activeWorld(); const repliesBefore = world.kaelTurns().length; armWriteFailures(world, { replyInserts: 2 })
    safeFailure(await world.request('', { message: FIRE }), 500, 'DB_ERROR', 'fire')
    expect(world.session().status).toBe('active'); expect(world.kaelTurns()).toHaveLength(repliesBefore); noBusiness(world)
  })
  it('quota stays 429, creates no Case and still delivers guidance', async () => {
    const world = newCaseWorld(); const before = snapshot(world)
    const client = world.db.client as unknown as {rpc: (name: string, args?: unknown) => Promise<unknown>}
    const original = client.rpc.bind(client)
    client.rpc = async (name, args) => name === 'check_kael_chat_rate'
      ? { data: [{ allowed: false, reason: 'minute', minute_count: 6, hour_count: 6 }], error: null } : original(name, args)
    safeFailure(await create(world, { message: FIRE }), 429, 'RATE_LIMITED', 'fire')
    expect(snapshot(world)).toBe(before); noBusiness(world)
  })
  it('SSE emits error and no result on rejected evidence', async () => {
    const world = activeWorld(); const before = snapshot(world)
    const response = await handlerFor(world)(new Request('https://edge.test/mobile-api/kael/chat/' + CASE_SESSION_ID + '/stream', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: ARC, evidence_items: [photo()] }),
    }))
    const text = await response.text()
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(text).toContain('event: error'); expect(text).not.toContain('event: result')
    expect(text).toContain('"emergency":{"version":"v1","route":"electrical_water"}')
    expect(text).not.toContain(ARC); expect(text).not.toContain(OWNER.id)
    expect(snapshot(world)).toBe(before); noBusiness(world)
  })
  it.each([OWNER, STRANGER, { id: OWNER.id, role: 'worker' } as Actor, { id: OWNER.id, role: 'admin' } as Actor])('ordinary or unauthorized caller receives no metadata: %j', async actor => {
    const world = activeWorld('hvac', { status: 'confirmed' }); const before = snapshot(world)
    const result = await world.request('', { message: actor === OWNER ? 'Cần hỗ trợ máy lạnh' : FIRE }, { as: actor })
    expect(result.status).toBe(actor === OWNER ? 409 : actor === STRANGER ? 404 : 403)
    expect(result.body.emergency).toBeUndefined(); expect(result.body.error).not.toContain('114')
    expect(snapshot(world)).toBe(before); noBusiness(world)
  })
  it('replay of a rejected closed request never creates consent or duplicates turns', async () => {
    const world = activeWorld('hvac', { status: 'confirmed' }); const before = snapshot(world)
    for (let i = 0; i < 2; i++) safeFailure(await world.request('', { message: FIRE }), 409, 'INVALID_STATUS', 'fire')
    expect(snapshot(world)).toBe(before); noBusiness(world)
  })
  it('ignores emergency fields from arbitrary exception extras while retaining other existing fields', async () => {
    const world = newCaseWorld()
    world.services.createKaelChat = async () => { throw new ApiFailure('VALIDATION', 'original refusal', 400, {
      emergency: { version: 'v1', route: 'fire', transcript: 'private' }, original_detail: 'retained',
    }) }
    const result = await create(world, { message: 'Cần hỗ trợ máy lạnh' })
    expect(result.status).toBe(400)
    expect(result.body).toMatchObject({ code: 'VALIDATION', error: 'original refusal', original_detail: 'retained' })
    expect(result.body.emergency).toBeUndefined(); noBusiness(world)
  })

})
