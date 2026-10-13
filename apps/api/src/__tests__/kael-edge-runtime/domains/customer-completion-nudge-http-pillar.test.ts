import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { createMobileApiHandler } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { readCompletionNudgeState } from '../../../../../../supabase/functions/mobile-api/_shared/domains/job/completion-nudge'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import type { QueryResult } from '../harness/sequence-client'

export const PILLAR = {
  id: 'P377-customer-completion-nudge-http',
  invariant: 'Only the owning Customer can nudge the worker of a job in repair; every refusal the database returns becomes a Vietnamese 409 with no push, and a nudge never moves the job status',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #5'],
  target: 'supabase/functions/mobile-api/_shared/domains/job/completion-nudge.ts',
  layer: 'security-negative',
  siblings: ['P86-customer-completion-http'],
  mutation: 'drop the Customer role guard, treat a refused nudge as success, or let the route update the job status; the refusal and no-write cases fail',
} as const satisfies PillarManifest

const JOB = 'f3770000-0000-4000-8000-000000000001'
const CUSTOMER = 'f3770000-0000-4000-8000-000000000002'
const WORKER = 'f3770000-0000-4000-8000-000000000003'

const accepted = {
  ok: true, reason: null, used: 1, max_allowed: 3, worker_id: WORKER,
  last_nudged_at: '2026-10-13T03:00:00.000Z', next_available_at: '2026-10-13T03:15:00.000Z',
}
const refused = (reason: string, nextAvailableAt: string | null = null) => ({
  ok: false, reason, used: 1, max_allowed: 3, worker_id: WORKER,
  last_nudged_at: '2026-10-13T03:00:00.000Z', next_available_at: nextAvailableAt,
})

function setup(input: {
  role?: 'customer' | 'worker' | 'admin'
  actorId?: string
  rpcResults?: QueryResult[]
} = {}) {
  const job = { id: JOB, customer_id: CUSTOMER, worker_id: WORKER, status: 'repairing' }
  const client = makeSequenceClient([], {
    nudge_worker_completion_atomic: input.rpcResults ?? [{ data: [accepted], error: null }],
  }, { jobs: Array.from({ length: 4 }, () => ({ data: job, error: null })) })
  const handler = createMobileApiHandler({
    authenticate: async () => ({
      success: true, user: { id: input.actorId ?? CUSTOMER }, role: input.role ?? 'customer',
      supabase: client, privilegedSupabase: client, userSupabase: client,
    }),
    services: createEdgeServices({}),
  })
  return {
    client,
    nudge: () => handler(new Request(`https://edge.test/jobs/${JOB}/nudge-completion`, { method: 'POST' })),
  }
}

const nudgeCalls = (client: ReturnType<typeof makeSequenceClient>) =>
  client.calls.filter((call) => call.table === 'rpc:nudge_worker_completion_atomic')

describe('Customer completion nudge at the public HTTP boundary', () => {
  installEdgeRuntimeTestHooks()

  it('records one nudge through the atomic function and reports the next window', async () => {
    const { client, nudge } = setup()
    const response = await nudge()
    expect(response.status, pillarWhy(PILLAR)).toBe(200)
    expect(await response.json()).toMatchObject({
      job_id: JOB, nudged: true, used: 1, max_allowed: 3,
      last_nudged_at: accepted.last_nudged_at, next_available_at: accepted.next_available_at,
    })
    expect(nudgeCalls(client)).toHaveLength(1)
    expect(nudgeCalls(client)[0].operations).toContainEqual(['rpc', 'nudge_worker_completion_atomic', { p_customer_id: CUSTOMER, p_job_id: JOB }])
    expect(client.calls.some((call) => call.table === 'jobs' && call.operations.some((op) => op[0] === 'update'))).toBe(false)
  })

  it('has no further window once the limit is used up', async () => {
    const { nudge } = setup({ rpcResults: [{ data: [{ ...accepted, used: 3, next_available_at: null }], error: null }] })
    expect(await (await nudge()).json()).toMatchObject({ used: 3, next_available_at: null, reason: 'LIMIT_REACHED' })
  })

  it.each(['worker', 'admin'] as const)('refuses the %s actor before any domain read or write', async (role) => {
    const { client, nudge } = setup({ role })
    const response = await nudge()
    expect(response.status, pillarWhy(PILLAR, 'role cannot substitute for Customer authority')).toBe(403)
    expect(client.calls.filter((call) => call.table === 'jobs')).toEqual([])
    expect(nudgeCalls(client)).toEqual([])
  })

  it('conceals another Customer job before the nudge function', async () => {
    const { client, nudge } = setup({ actorId: 'f3770000-0000-4000-8000-000000000099' })
    const response = await nudge()
    expect(response.status, pillarWhy(PILLAR)).toBe(404)
    expect(nudgeCalls(client)).toEqual([])
  })

  it.each([
    ['INVALID_STATUS', 'INVALID_STATUS'],
    ['NO_WORKER', 'INVALID_STATUS'],
    ['WORK_PAUSED', 'NUDGE_WORK_PAUSED'],
    ['TOO_EARLY', 'NUDGE_TOO_EARLY'],
    ['COOLDOWN', 'NUDGE_COOLDOWN'],
    ['LIMIT_REACHED', 'NUDGE_LIMIT_REACHED'],
  ] as const)('answers the refusal %s as a 409 %s', async (reason, code) => {
    const { nudge } = setup({ rpcResults: [{ data: [refused(reason, '2026-10-13T03:15:00.000Z')], error: null }] })
    const response = await nudge()
    expect(response.status, pillarWhy(PILLAR, 'a refused nudge is never a success')).toBe(409)
    const body = await response.json()
    expect(body).toMatchObject({ code })
    expect(String(body.error ?? body.message ?? '')).toMatch(/[ạảãàáâấầẩẫậăắằẳẵặẹẻẽèéêếềểễệỉĩịọỏõòóôốồổỗộơớờởỡợụủũùúưứừửữựỳỷỹýđ]/i)
  })

  it('answers a job the database does not know as 404', async () => {
    const { nudge } = setup({ rpcResults: [{ data: null, error: { code: 'P0001', message: 'JOB_NOT_FOUND' } }] })
    expect((await nudge()).status).toBe(404)
  })

  it('does not report success when the database function fails', async () => {
    const { nudge } = setup({ rpcResults: [{ data: null, error: { code: '57014', message: 'timeout' } }] })
    expect((await nudge()).status).toBe(500)
  })
})

describe('readCompletionNudgeState', () => {
  installEdgeRuntimeTestHooks()

  it('maps the database state for the job read', async () => {
    const client = makeSequenceClient([], {
      completion_nudge_state: [{
        data: [{ can_nudge: false, reason: 'COOLDOWN', used: 1, max_allowed: 3, last_nudged_at: '2026-10-13T03:00:00.000Z', next_available_at: '2026-10-13T03:15:00.000Z' }],
        error: null,
      }],
    })
    await expect(readCompletionNudgeState(client as never, JOB)).resolves.toEqual({
      can_nudge: false, reason: 'COOLDOWN', used: 1, max_allowed: 3,
      last_nudged_at: '2026-10-13T03:00:00.000Z', next_available_at: '2026-10-13T03:15:00.000Z',
    })
  })

  it('returns null instead of failing the job read when the state cannot be read', async () => {
    const client = makeSequenceClient([], { completion_nudge_state: [{ data: null, error: { code: '42883', message: 'function does not exist' } }] })
    await expect(readCompletionNudgeState(client as never, JOB)).resolves.toBeNull()
  })
})
