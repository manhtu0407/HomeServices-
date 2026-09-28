import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { normalizeEmail } from '../../../../../../supabase/functions/mobile-api/_shared/domains/program/identity-hmac'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P222-identity-hmac-no-plaintext',
  invariant:
    'a CCCD, phone number or sign-in email reaches the database only as a keyed SHA-256 digest (plus the CCCD last four); the plaintext never appears in any RPC argument, table write or log line, one subscriber written as +84 or 0 and one Gmail account spelled with dots, +tags or googlemail.com each yield one digest, a CCCD is not recorded without the worker contact digests, and a missing or short IDENTITY_HMAC_KEY fails closed with 503 before anything is written',
  authority: [
    'governance/RULES.md #3, #7',
    'Tu 2026-09-25: CCCD + phone blocklist stored hashed',
    'supabase/migrations/20260925121000_identity_blocklist.sql',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/program/identity-hmac.ts',
  layer: 'integration',
  siblings: ['P221-discipline-edge-routes', 'P219-appeal-restores-exactly-sql'],
  mutation:
    'pass input.cccd_number as p_cccd_hmac, or drop the key-length check in identityKey — the plaintext or fail-closed case turns red',
} as const satisfies PillarManifest

const OPERATOR = 'a2220000-0000-4000-8000-000000000003'
const WORKER = 'a2220000-0000-4000-8000-000000000001'
const CASE_ID = 'c2220000-0000-4000-8000-000000000001'
const CCCD = '079201012345'
const KEY = 'k'.repeat(48)

const harmCase = {
  id: CASE_ID, worker_id: WORKER, worker_name: 'Thợ A', customer_id: null, job_id: null, violation_code: 'theft', level: 5,
  source: 'customer_report', statement: 'Mất đồ', status: 'proposed', decision_deadline_at: '2026-09-28T00:00:00Z',
  decided_at: null, decision_reason: null, appeal_status: 'none', appeal_deadline_at: null, suspended_pending_review: true,
  created_at: '2026-09-25T00:00:00Z', consequences: [], evidence: {}, identity_recorded: true, appeal: null, chat_evidence: [], events: [],
}

function stubKey(key: string | undefined) {
  vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'IDENTITY_HMAC_KEY' ? key : undefined } })
}

const WORKER_EMAIL = 'Nguyen.Van.A+work@googlemail.com'
const WORKER_PHONE = '0912345678'

function setup(
  rpc: Parameters<typeof makeSequenceClient>[1],
  tables: Parameters<typeof makeSequenceClient>[2] = {},
  authUser: { email?: string } | 'error' = { email: WORKER_EMAIL },
) {
  const service = makeSequenceClient([], rpc, {
    profiles: [{ data: { phone: WORKER_PHONE }, error: null }],
    admin_operator_accounts: [
      { data: { capabilities: ['workers.review', 'workers.discipline.manage'], status: 'active' }, error: null },
      { data: { capabilities: ['workers.review', 'workers.discipline.manage'], status: 'active' }, error: null },
    ],
    ...tables,
  })
  Object.assign(service, {
    auth: { admin: { getUserById: async () => authUser === 'error'
      ? { data: { user: null }, error: { message: 'auth unavailable' } }
      : { data: { user: authUser }, error: null } } },
  })
  const handler = createMobileApiHandler({
    authenticate: async (): Promise<MobileApiAuthResult> => ({
      success: true, user: { id: OPERATOR }, role: 'admin_operator', supabase: service, privilegedSupabase: service, userSupabase: service,
    }),
    services: createEdgeServices({}),
  })
  const call = (method: string, path: string, body: unknown) => handler(new Request(`https://edge.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'idempotency-key': 'mobile:33333333-3333-4333-8333-333333333333' },
    body: JSON.stringify(body),
  }))
  return { call, service }
}

function captureLogs() {
  const lines: string[] = []
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '))
    })
  }
  return lines
}

describe(`${PILLAR.id}: identity digests`, () => {
  installEdgeRuntimeTestHooks()
  afterEach(() => vi.restoreAllMocks())

  it('stores a CCCD only as a 64-hex digest and its last four', async () => {
    stubKey(KEY)
    const logs = captureLogs()
    const { call, service } = setup({
      admin_set_worker_identity_number: [{ data: { worker_id: WORKER, cccd_last4: '2345' }, error: null }],
    })
    const response = await call('PUT', `/admin/discipline/workers/${WORKER}/identity-number`, { cccd_number: CCCD })
    expect(response.status, pillarWhy(PILLAR, JSON.stringify(await response.clone().json()))).toBe(200)
    expect(await response.json()).toEqual({ worker_id: WORKER, cccd_last4: '2345' })
    const args = service.calls.find((entry) => entry.table === 'rpc:admin_set_worker_identity_number')?.operations[0]?.[2] as Record<string, unknown>
    expect(args.p_cccd_hmac).toMatch(/^[0-9a-f]{64}$/)
    expect(args.p_cccd_last4).toBe('2345')
    expect(args.p_phone_hmac).toMatch(/^[0-9a-f]{64}$/)
    expect(args.p_email_hmac).toMatch(/^[0-9a-f]{64}$/)
    const everything = JSON.stringify(service.calls) + logs.join('\n')
    expect(everything.includes(CCCD), pillarWhy(PILLAR, 'the full CCCD number leaked')).toBe(false)
    expect(everything.toLowerCase().includes('nguyen'), pillarWhy(PILLAR, 'the sign-in email leaked')).toBe(false)
    expect(everything.includes('912345678'), pillarWhy(PILLAR, 'the phone number leaked')).toBe(false)
  })

  it('fails closed with 503 when the key is missing or short, before any write', async () => {
    for (const key of [undefined, 'short-key']) {
      stubKey(key)
      const { call, service } = setup({})
      const response = await call('PUT', `/admin/discipline/workers/${WORKER}/identity-number`, { cccd_number: CCCD })
      expect(response.status, pillarWhy(PILLAR, `key=${String(key)}`)).toBe(503)
      expect(await response.json()).toMatchObject({ code: 'IDENTITY_KEY_UNAVAILABLE' })
      expect(service.calls.some((entry) => entry.table === 'rpc:admin_set_worker_identity_number')).toBe(false)
    }
  })

  it('blocks a confirmed harm case by phone digest, one digest for +84 and 0 forms', async () => {
    stubKey(KEY)
    const digests: string[] = []
    for (const phone of ['+84 912 345 678', '0912345678']) {
      const logs = captureLogs()
      const { call, service } = setup({
        admin_get_violation_case: [{ data: harmCase, error: null }],
        admin_decide_violation_case: [{ data: { ...harmCase, status: 'confirmed' }, error: null }],
      }, { profiles: [{ data: { phone }, error: null }] })
      const response = await call('POST', `/admin/discipline/cases/${CASE_ID}/decision`, { decision: 'confirm', reason: 'Camera xác nhận hành vi.' })
      expect(response.status, pillarWhy(PILLAR, JSON.stringify(await response.clone().json()))).toBe(200)
      const args = service.calls.find((entry) => entry.table === 'rpc:admin_decide_violation_case')?.operations[0]?.[2] as { p_blocklist: Array<{ kind: string; value_hmac: string }> }
      expect(args.p_blocklist.map((item) => item.kind).sort(), pillarWhy(PILLAR, 'a harm case blocks the phone and the sign-in email')).toEqual(['email', 'phone'])
      for (const item of args.p_blocklist) expect(item.value_hmac).toMatch(/^[0-9a-f]{64}$/)
      digests.push(args.p_blocklist.find((item) => item.kind === 'phone')?.value_hmac ?? '')
      const written = JSON.stringify(service.calls.filter((entry) => entry.table.startsWith('rpc:'))) + logs.join('\n')
      expect(written.includes('912345678'), pillarWhy(PILLAR, 'the phone number leaked into an RPC or log')).toBe(false)
      expect(written.toLowerCase().includes('nguyen'), pillarWhy(PILLAR, 'the email leaked into an RPC or log')).toBe(false)
      vi.restoreAllMocks()
    }
    expect(digests[0], pillarWhy(PILLAR, 'two spellings of one number must block together')).toBe(digests[1])
  })

  it('keys the digest, so a different key gives a different digest', async () => {
    const digestWith = async (key: string) => {
      stubKey(key)
      const { call, service } = setup({
        admin_set_worker_identity_number: [{ data: { worker_id: WORKER, cccd_last4: '2345' }, error: null }],
      })
      await call('PUT', `/admin/discipline/workers/${WORKER}/identity-number`, { cccd_number: CCCD })
      const args = service.calls.find((entry) => entry.table === 'rpc:admin_set_worker_identity_number')?.operations[0]?.[2] as Record<string, unknown>
      return args.p_cccd_hmac
    }
    expect(await digestWith(KEY), pillarWhy(PILLAR, 'an unkeyed hash of a 12-digit number is brute-forceable')).not.toBe(await digestWith('z'.repeat(48)))
  })

  it('folds every spelling of one Gmail account into one address', () => {
    const canonical = normalizeEmail('nguyenvana@gmail.com')
    for (const spelling of [WORKER_EMAIL, 'NGUYEN.VAN.A@gmail.com', ' nguyenvana+x@gmail.com ']) {
      expect(normalizeEmail(spelling), pillarWhy(PILLAR, spelling)).toBe(canonical)
    }
    expect(normalizeEmail('Nguyen.A+1@Yahoo.com'), pillarWhy(PILLAR, 'other providers keep their local part')).toBe('nguyen.a+1@yahoo.com')
    expect(normalizeEmail('not-an-email')).toBeNull()
  })

  it('does not record a CCCD when the worker contact cannot be read', async () => {
    stubKey(KEY)
    const { call, service } = setup({}, {}, 'error')
    const response = await call('PUT', `/admin/discipline/workers/${WORKER}/identity-number`, { cccd_number: CCCD })
    expect(response.status, pillarWhy(PILLAR, 'a CCCD without its contact digests leaves re-registration open')).toBe(500)
    expect(service.calls.some((entry) => entry.table === 'rpc:admin_set_worker_identity_number')).toBe(false)
  })
})
