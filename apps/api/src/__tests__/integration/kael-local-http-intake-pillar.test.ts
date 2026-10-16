import { randomBytes, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { resolveLocalQaHttpTarget } from '../../../../../scripts/harness/local-qa-http-target.mjs'
import { pillarPrerequisite, pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P391-kael-local-http-intake',
  invariant: 'real local Auth and Edge persist one deferred intake per request ID, preserve all six service identities, and deny another customer access without inference',
  authority: ['governance/RULES.md #0', 'governance/RULES.md #6', 'governance/RULES.md #8', 'governance/RULES.md #9'],
  target: 'POST/GET mobile-api/kael/chat through local Auth, Edge and PostgreSQL',
  layer: 'integration',
  siblings: ['P43-staging-service-catalog', 'P388-mobile-client-contract-compatibility'],
  mutation: 'replace the replay client_request_id with a fresh UUID; the real HTTP replay identity assertion must fail, then pass after restoration',
} as const satisfies PillarManifest

const target = resolveLocalQaHttpTarget(process.env)
const available = pillarPrerequisite(PILLAR, {
  available: target !== null,
  hint: 'Run scripts/harness/run-local-qa-http.mjs against an explicitly named, loopback-bound QA stack with inference disabled.',
})
const integration = available ? describe.sequential : describe.skip
type JsonRecord = Record<string, unknown>
type Actor = { id: string; token: string }

function record(value: unknown): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(pillarWhy(PILLAR, 'expected a JSON object'))
  return value as JsonRecord
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error(pillarWhy(PILLAR, 'required response field missing'))
  return value
}

async function request(path: string, options: { method?: string; token?: string; key?: string; body?: unknown; compatible?: boolean } = {}) {
  if (!target) throw new Error(pillarWhy(PILLAR, 'named target absent'))
  const url = new URL(path, target.url)
  if (url.origin !== target.url) throw new Error(pillarWhy(PILLAR, 'cross-origin QA request refused'))
  const response = await fetch(url, {
    method: options.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000),
    headers: {
      apikey: options.key ?? target.serviceRoleKey ?? '',
      authorization: `Bearer ${options.token ?? target.serviceRoleKey ?? ''}`,
      'content-type': 'application/json',
      ...(options.compatible === false ? {} : {
        origin: 'http://localhost:8086',
        'x-client-platform': 'web-preview',
        'x-client-contract-epoch': '2',
        'x-client-application-id': 'com.phanmanhtu.nestscout.web-preview',
      }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload: unknown = await response.json()
  return { status: response.status, payload }
}

async function customer(): Promise<Actor> {
  const email = `qa-http-${randomUUID()}@example.invalid`
  const password = `Qa!${randomBytes(24).toString('hex')}`
  const created = await request('/auth/v1/admin/users', { method: 'POST', body: { email, password, email_confirm: true, user_metadata: { full_name: 'QA HTTP fixture' } } })
  expect(created.status, pillarWhy(PILLAR, 'local Auth fixture creation')).toBe(200)
  const signedIn = await request('/auth/v1/token?grant_type=password', { method: 'POST', key: target?.anonKey, body: { email, password } })
  expect(signedIn.status, pillarWhy(PILLAR, 'actual password sign-in')).toBe(200)
  return { id: text(record(created.payload).id), token: text(record(signedIn.payload).access_token) }
}

integration('Kael deferred intake through actual local HTTP services', () => {
  let owner: Actor
  let second: Actor
  let startedAt: string
  const sessions: string[] = []

  beforeAll(async () => {
    startedAt = new Date().toISOString()
    const health = await request('/functions/v1/mobile-api/harness/health')
    expect(health.status, pillarWhy(PILLAR)).toBe(200)
    expect(record(record(health.payload).environment).name, pillarWhy(PILLAR)).toBe('local')
    const readiness = record(record(record(health.payload).release).provider_readiness)
    expect(readiness.global_ai_enabled, pillarWhy(PILLAR, 'live inference must be disabled')).toBe(false)
    owner = await customer()
    second = await customer()
  }, 40_000)

  it('rejects a write without the actual Preview compatibility identity', async () => {
    const response = await request('/functions/v1/mobile-api/kael/chat', {
      method: 'POST', token: owner.token, key: target?.anonKey, compatible: false,
      body: { service_type: 'electrical', message: 'Kiểm thử intake', defer_analysis: true, client_request_id: randomUUID() },
    })
    expect(response.status, pillarWhy(PILLAR)).toBe(426)
    expect(record(response.payload).code, pillarWhy(PILLAR)).toBe('CLIENT_UPDATE_REQUIRED')
  })

  for (const serviceType of ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']) {
    it(`persists and reopens ${serviceType} once, with owner-only access`, async () => {
      // The sixth independent scenario respects the server's five-creation limit.
      const actor = serviceType === 'handyman' ? second : owner
      const foreign = serviceType === 'handyman' ? owner : second
      const input = { service_type: serviceType, message: `Kiểm thử intake ${serviceType}`, problem_chips: [], photo_urls: [], client_request_id: randomUUID(), defer_analysis: true, language: 'vi' }
      const options = { method: 'POST', token: actor.token, key: target?.anonKey, body: input }
      const created = await request('/functions/v1/mobile-api/kael/chat', options)
      expect(created.status, pillarWhy(PILLAR, `create ${serviceType}`)).toBe(201)
      const session = record(record(created.payload).session)
      const id = text(session.id)
      expect(session.customer_id, pillarWhy(PILLAR)).toBe(actor.id)
      expect(session.service_type, pillarWhy(PILLAR)).toBe(serviceType)
      sessions.push(id)
      const reopened = await request(`/functions/v1/mobile-api/kael/chat/${id}`, { token: actor.token, key: target?.anonKey })
      expect(reopened.status, pillarWhy(PILLAR)).toBe(200)
      expect(record(record(reopened.payload).session).id, pillarWhy(PILLAR)).toBe(id)
      const replay = await request('/functions/v1/mobile-api/kael/chat', options)
      expect(replay.status, pillarWhy(PILLAR)).toBe(201)
      expect(record(record(replay.payload).session).id, pillarWhy(PILLAR, 'same request ID must reuse persisted identity')).toBe(id)
      const denied = await request(`/functions/v1/mobile-api/kael/chat/${id}`, { token: foreign.token, key: target?.anonKey })
      expect([403, 404], pillarWhy(PILLAR, 'foreign ownership must be denied')).toContain(denied.status)
    }, 45_000)
  }

  it('reads exactly six persisted sessions and turns with no job or provider spend', async () => {
    expect(sessions, pillarWhy(PILLAR)).toHaveLength(6)
    const rows = await request(`/rest/v1/kael_chat_sessions?select=id,job_id,total_cost_usd&customer_id=in.(${owner.id},${second.id})`)
    expect(rows.status, pillarWhy(PILLAR)).toBe(200)
    expect(Array.isArray(rows.payload), pillarWhy(PILLAR)).toBe(true)
    if (!Array.isArray(rows.payload)) throw new Error(pillarWhy(PILLAR, 'database response was not rows'))
    expect(rows.payload, pillarWhy(PILLAR, 'replay must not create extra sessions')).toHaveLength(6)
    for (const value of rows.payload) {
      const row = record(value)
      expect(row.job_id, pillarWhy(PILLAR)).toBeNull()
      expect(Number(row.total_cost_usd), pillarWhy(PILLAR)).toBe(0)
    }
    const turns = await request(`/rest/v1/kael_chat_turns?select=id&session_id=in.(${sessions.join(',')})`)
    expect(turns.status, pillarWhy(PILLAR)).toBe(200)
    expect(turns.payload, pillarWhy(PILLAR, 'initial turns must not duplicate on replay')).toHaveLength(6)
    const logs = await request(`/rest/v1/api_logs?select=id&created_at=gte.${startedAt}&limit=1`)
    expect(logs.status, pillarWhy(PILLAR)).toBe(200)
    expect(logs.payload, pillarWhy(PILLAR, 'no provider request must be recorded')).toEqual([])
  })
})
