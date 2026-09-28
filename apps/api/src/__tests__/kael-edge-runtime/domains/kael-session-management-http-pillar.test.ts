import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks } from '../harness'

export const PILLAR = {
  id: 'P253-kael-session-management-http',
  invariant:
    'Customer and Worker Kael sessions can be created, pinned, renamed, and archived through the real mobile-api handler against persisted state, each write lands only on the caller\'s own session, and another account\'s session is refused without being changed',
  authority: [
    'governance/RULES.md #0 (workflow writes go through mobile-api)',
    'governance/RULES.md #8 (a refused write never reads back as saved)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/customer/kael-conversation.ts',
  layer: 'integration',
  siblings: ['P252-kael-chat-http-roundtrip', 'P249-worker-kael-release-client-guard'],
  mutation:
    'drop the customer_id filter from readCustomerConversation or the worker_id check from readWorkerKaelSession; the foreign-session case turns red. Dropping the title trim turns the rename case red only when both the request schema and the domain write stop trimming, since either layer alone keeps the stored title trimmed',
} as const satisfies PillarManifest

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

// A small in-memory PostgREST stand-in: rows persist across requests and filters really filter,
// so a missing owner condition shows up as a changed foreign row instead of a scripted reply.
function makeStatefulClient(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; op: string; payload: unknown }> = []
  let sequence = 0
  const nextId = () => `c253abcd-0000-4000-8000-${String(++sequence).padStart(12, '0')}`

  function from(table: string) {
    const rows = (tables[table] ??= [])
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: Row = {}
    let cardinality: 'many' | 'single' | 'maybe' = 'many'
    const filters: Filter[] = []
    const builder = {
      select: () => builder,
      insert: (value: Row) => { op = 'insert'; payload = value; return builder },
      update: (value: Row) => { op = 'update'; payload = value; return builder },
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder },
      is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return builder },
      neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return builder },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder },
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      single: () => { cardinality = 'single'; return builder },
      maybeSingle: () => { cardinality = 'maybe'; return builder },
      then(resolve: (value: { data: unknown; error: unknown }) => unknown, reject?: (reason: unknown) => unknown) {
        try {
          let matched: Row[]
          if (op === 'insert') {
            const now = new Date().toISOString()
            const row: Row = {
              id: nextId(), archived_at: null, pinned_at: null, title: null, total_turns: 0,
              created_at: now, updated_at: now, started_at: now, closed_at: null, kael_progress: null,
              case_session_id: null, ...payload,
            }
            rows.push(row)
            writes.push({ table, op, payload })
            matched = [row]
          } else {
            matched = rows.filter((row) => filters.every((filter) => filter(row)))
            if (op === 'update') {
              for (const row of matched) Object.assign(row, payload, { updated_at: new Date().toISOString() })
              writes.push({ table, op, payload: { ...payload, matched: matched.map((row) => row.id) } })
            }
          }
          const data = cardinality === 'many' ? matched : matched[0] ?? null
          const error = cardinality === 'single' && matched.length !== 1
            ? { code: 'PGRST116', message: 'no rows' }
            : null
          return Promise.resolve({ data, error }).then(resolve, reject)
        } catch (error) {
          return Promise.reject(error).then(resolve, reject)
        }
      },
    }
    return builder
  }

  return {
    writes,
    tables,
    from,
    rpc: () => Promise.resolve({ data: null, error: null }),
  }
}

const CUSTOMER = 'c253abcd-0000-4000-8000-0000000000c1'
const OTHER_CUSTOMER = 'c253abcd-0000-4000-8000-0000000000c2'
const WORKER = 'c253abcd-0000-4000-8000-0000000000d1'
const OTHER_WORKER = 'c253abcd-0000-4000-8000-0000000000d2'
const RELEASED = {
  'x-client-platform': 'ios',
  'x-client-application-id': 'com.phanmanhtu.homeservices',
  'x-client-build-number': '45',
}

function handlerFor(role: 'customer' | 'worker', userId: string, client: ReturnType<typeof makeStatefulClient>) {
  const handler = createMobileApiHandler({
    authenticate: async (): Promise<MobileApiAuthResult> => ({
      success: true, user: { id: userId }, role, supabase: client, privilegedSupabase: client, userSupabase: client,
    }),
    services: createEdgeServices({} as Parameters<typeof createEdgeServices>[0]),
    clientCompatibility: {
      contractEpoch: 2,
      releaseId: 'harness-p253-release',
      gitSha: 'c'.repeat(40),
      ios: { applicationId: 'com.phanmanhtu.homeservices', minimumBuildNumber: 45, easBuildId: null, runtimeVersion: null },
      android: { applicationId: 'com.phanmanhtu.nestscout', minimumBuildNumber: 4, easBuildId: null, runtimeVersion: null },
    },
  })
  return async (method: string, path: string, body?: unknown) => {
    const response = await handler(new Request(`https://edge.test${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...RELEASED },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }))
    return { status: response.status, body: await response.json() as Record<string, any> }
  }
}

describe('P253 Kael session management over the real mobile-api handler', () => {
  installEdgeRuntimeTestHooks()

  it('creates, pins, renames, and archives a Customer conversation on persisted state', async () => {
    const client = makeStatefulClient({})
    const call = handlerFor('customer', CUSTOMER, client)

    const created = await call('POST', '/me/kael/conversations', { client_request_id: 'c253abcd-0000-4000-8000-0000000000a1', mode: 'normal' })
    expect(created.status, pillarWhy(PILLAR, JSON.stringify(created.body))).toBe(201)
    const id = created.body.session.id as string
    expect(created.body.session).toMatchObject({ customer_id: CUSTOMER, mode: 'normal', title: null, pinned_at: null })

    const replay = await call('POST', '/me/kael/conversations', { client_request_id: 'c253abcd-0000-4000-8000-0000000000a1', mode: 'normal' })
    expect(replay.body.session.id, pillarWhy(PILLAR, 'a retried create returns the same conversation')).toBe(id)
    expect(client.tables.kael_customer_conversations).toHaveLength(1)

    const pinned = await call('PATCH', `/me/kael/conversations/${id}/pin`, { pinned: true })
    expect(pinned.status, pillarWhy(PILLAR, JSON.stringify(pinned.body))).toBe(200)
    expect(pinned.body.session.pinned_at).toEqual(expect.any(String))

    const renamed = await call('PATCH', `/me/kael/conversations/${id}`, { title: '  Máy lạnh phòng ngủ  ' })
    expect(renamed.status, pillarWhy(PILLAR, JSON.stringify(renamed.body))).toBe(200)
    expect(renamed.body.session.title, pillarWhy(PILLAR, 'the stored title is trimmed')).toBe('Máy lạnh phòng ngủ')

    const unpinned = await call('PATCH', `/me/kael/conversations/${id}/pin`, { pinned: false })
    expect(unpinned.body.session.pinned_at).toBeNull()

    const archived = await call('DELETE', `/me/kael/conversations/${id}`)
    expect(archived.status, pillarWhy(PILLAR, JSON.stringify(archived.body))).toBe(200)
    expect(archived.body).toMatchObject({ session_id: id, case_action: 'none' })
    const listed = await call('GET', '/me/kael/conversations?mode=normal')
    expect(listed.body.sessions?.map((session: { id: string }) => session.id) ?? [], pillarWhy(PILLAR, JSON.stringify(listed.body))).not.toContain(id)
  })

  it('refuses to pin, rename, or archive another Customer\'s conversation and leaves it unchanged', async () => {
    const foreign = {
      id: 'c253abcd-0000-4000-8000-0000000000f1', customer_id: OTHER_CUSTOMER, chat_mode: 'normal',
      client_request_id: 'c253abcd-0000-4000-8000-0000000000f2', title: 'Của người khác', pinned_at: null,
      archived_at: null, case_session_id: null, total_turns: 0,
      created_at: '2026-09-28T00:00:00.000Z', updated_at: '2026-09-28T00:00:00.000Z',
    }
    const client = makeStatefulClient({ kael_customer_conversations: [{ ...foreign }] })
    const call = handlerFor('customer', CUSTOMER, client)

    const results = [
      await call('PATCH', `/me/kael/conversations/${foreign.id}/pin`, { pinned: true }),
      await call('PATCH', `/me/kael/conversations/${foreign.id}`, { title: 'Chiếm quyền' }),
      await call('DELETE', `/me/kael/conversations/${foreign.id}`),
    ]
    expect(results.map((result) => result.status), pillarWhy(PILLAR, JSON.stringify(results))).toEqual([404, 404, 404])
    expect(client.tables.kael_customer_conversations[0], pillarWhy(PILLAR, 'the foreign row must not change')).toMatchObject({
      title: 'Của người khác', pinned_at: null, archived_at: null,
    })
  })

  it('creates, pins, renames, and archives a Worker conversation on persisted state', async () => {
    const client = makeStatefulClient({})
    const call = handlerFor('worker', WORKER, client)

    const created = await call('POST', '/workers/me/kael/chat', { client_request_id: 'c253abcd-0000-4000-8000-0000000000b1', language: 'vi', mode: 'normal' })
    expect(created.status, pillarWhy(PILLAR, JSON.stringify(created.body))).toBe(201)
    const id = created.body.session.id as string
    expect(created.body.session).toMatchObject({ worker_id: WORKER, mode: 'normal', status: 'active', job_id: null })

    const pinned = await call('PATCH', `/workers/me/kael/chat/${id}/pin`, { pinned: true })
    expect(pinned.status, pillarWhy(PILLAR, JSON.stringify(pinned.body))).toBe(200)
    expect(pinned.body.session.pinned_at).toEqual(expect.any(String))

    const renamed = await call('PATCH', `/workers/me/kael/chat/${id}`, { title: 'Thay ổ cắm' })
    expect(renamed.status, pillarWhy(PILLAR, JSON.stringify(renamed.body))).toBe(200)
    expect(renamed.body.session.title).toBe('Thay ổ cắm')

    const archived = await call('DELETE', `/workers/me/kael/chat/${id}`)
    expect(archived.status, pillarWhy(PILLAR, JSON.stringify(archived.body))).toBe(200)
    expect(archived.body).toMatchObject({ session_id: id, archived_at: expect.any(String) })
    expect(client.tables.kael_worker_chat_sessions[0]).toMatchObject({ status: 'closed' })
  })

  it('refuses to pin, rename, or archive another Worker\'s conversation and leaves it unchanged', async () => {
    const foreign = {
      id: 'c253abcd-0000-4000-8000-0000000000e1', worker_id: OTHER_WORKER, job_id: null, chat_mode: 'normal',
      status: 'active', title: 'Của thợ khác', pinned_at: null, archived_at: null, closed_at: null,
      started_at: '2026-09-28T00:00:00.000Z', total_turns: 0, kael_progress: null,
    }
    const client = makeStatefulClient({ kael_worker_chat_sessions: [{ ...foreign }] })
    const call = handlerFor('worker', WORKER, client)

    const results = [
      await call('PATCH', `/workers/me/kael/chat/${foreign.id}/pin`, { pinned: true }),
      await call('PATCH', `/workers/me/kael/chat/${foreign.id}`, { title: 'Chiếm quyền' }),
      await call('DELETE', `/workers/me/kael/chat/${foreign.id}`),
    ]
    expect(results.map((result) => result.status), pillarWhy(PILLAR, JSON.stringify(results))).toEqual([404, 404, 404])
    expect(client.tables.kael_worker_chat_sessions[0], pillarWhy(PILLAR, 'the foreign row must not change')).toMatchObject({
      title: 'Của thợ khác', pinned_at: null, archived_at: null, status: 'active',
    })
  })
})
