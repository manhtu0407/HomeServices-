import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  requireJobAccess,
  type JobAccessDbClient,
} from '../../../../../supabase/functions/mobile-api/_shared/platform/access'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/http'

export const PILLAR = {
  id: 'P19-job-access-ownership',
  invariant:
    'a job the caller does not own answers exactly as a job that does not exist, and a role the route forbids is refused before the database is read at all',
  authority: [
    'governance/RULES.md #0 (the Edge owns role guards and workflow access)',
    'governance/RULES.md #5 (user-facing errors are Vietnamese)',
  ],
  target: 'supabase/functions/mobile-api/_shared/platform/access.ts',
  layer: 'security-negative',
  siblings: ['P18-capability-registry-parity', 'P12-workflow-transition-composition', 'P10-per-actor-rls'],
  mutation:
    'change the cross-tenant customer branch from NOT_FOUND/404 to AUTH_FORBIDDEN/403 — the no-existence-leak cases turn red, because a 403 confirms the job exists',
} as const satisfies PillarManifest

const OWNER_CUSTOMER = 'owner-customer'
const OWNER_WORKER = 'owner-worker'
const INTRUDER = 'someone-else'

const OWNED_JOB = {
  id: 'job-p19',
  status: 'arrived',
  customer_id: OWNER_CUSTOMER,
  worker_id: OWNER_WORKER,
}

// Counts every read so "refused before any database read" can be asserted rather than assumed.
function jobClient(job: Record<string, unknown> | null, error: unknown = null) {
  const state = { reads: 0 }
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => {
      state.reads += 1
      return { data: job, error }
    },
  }
  return {
    state,
    client: { from: () => chain } as unknown as JobAccessDbClient,
  }
}

function ctxFor(role: string, userId: string): MobileApiContext {
  return { success: true, user: { id: userId }, role, supabase: {} } as unknown as MobileApiContext
}

describe('requireJobAccess ownership', () => {
  it('lets the owning customer through', async () => {
    const { client } = jobClient(OWNED_JOB)
    const job = await requireJobAccess(client, 'job-p19', ctxFor('customer', OWNER_CUSTOMER))
    expect(
      job.id,
      pillarWhy(PILLAR, 'the gate must not block the person the job belongs to'),
    ).toBe('job-p19')
  })

  it('lets the assigned worker through', async () => {
    const { client } = jobClient(OWNED_JOB)
    const job = await requireJobAccess(client, 'job-p19', ctxFor('worker', OWNER_WORKER))
    expect(
      job.id,
      pillarWhy(PILLAR, 'the assigned worker needs the job to do the work'),
    ).toBe('job-p19')
  })

  // The Edge runs on the service-role client with RLS bypassed, so this function *is* the IDOR
  // defence for reads. Answering 403 would confirm the job exists; 404 tells the intruder nothing.
  it.each([
    ['a customer who does not own it', 'customer', INTRUDER],
    ['a worker who is not assigned', 'worker', INTRUDER],
  ])('refuses %s with the same answer as a missing job', async (_label, role, userId) => {
    const { client } = jobClient(OWNED_JOB)
    await expect(
      requireJobAccess(client, 'job-p19', ctxFor(role, userId)),
      pillarWhy(PILLAR, 'a distinguishable refusal leaks which job ids are real'),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('answers a genuinely missing job identically', async () => {
    const { client } = jobClient(null)
    await expect(
      requireJobAccess(client, 'job-missing', ctxFor('customer', OWNER_CUSTOMER)),
      pillarWhy(PILLAR, 'the missing case is the shape the cross-tenant case has to copy'),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('answers a failed read as not-found rather than leaking the error', async () => {
    const { client } = jobClient(null, { message: 'connection reset' })
    await expect(
      requireJobAccess(client, 'job-p19', ctxFor('customer', OWNER_CUSTOMER)),
      pillarWhy(PILLAR, 'a database error must not become a different, more informative answer'),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })
})

describe('requireJobAccess role gate', () => {
  it('refuses a role mismatch before reading anything', async () => {
    const { client, state } = jobClient(OWNED_JOB)
    await expect(
      requireJobAccess(client, 'job-p19', ctxFor('customer', OWNER_CUSTOMER), {
        requiredRole: 'worker',
      }),
      pillarWhy(PILLAR, 'a forbidden role must be refused, not merely scoped'),
    ).rejects.toMatchObject({ status: 403, code: 'AUTH_FORBIDDEN' })

    expect(
      state.reads,
      pillarWhy(PILLAR, 'reading the row first would spend a query on a caller already refused'),
    ).toBe(0)
  })

  it('refuses in Vietnamese', async () => {
    const { client } = jobClient(OWNED_JOB)
    await expect(
      requireJobAccess(client, 'job-p19', ctxFor('customer', OWNER_CUSTOMER), {
        requiredRole: 'worker',
      }),
      pillarWhy(PILLAR, 'a Vietnamese-first product must refuse in Vietnamese'),
    ).rejects.toMatchObject({ message: 'Bạn không có quyền thực hiện hành động này' })
  })
})

describe('requireJobAccess status gate', () => {
  it('refuses a job whose status moved on', async () => {
    const { client } = jobClient(OWNED_JOB)
    await expect(
      requireJobAccess(client, 'job-p19', ctxFor('customer', OWNER_CUSTOMER), {
        statuses: ['repairing'],
      }),
      pillarWhy(PILLAR, 'acting on a stale status is how two clients race the same transition'),
    ).rejects.toMatchObject({ status: 409, code: 'INVALID_STATUS' })
  })

  it('allows a job whose status is in the permitted set', async () => {
    const { client } = jobClient(OWNED_JOB)
    const job = await requireJobAccess(client, 'job-p19', ctxFor('customer', OWNER_CUSTOMER), {
      statuses: ['arrived', 'inspecting'],
    })
    expect(
      job.status,
      pillarWhy(PILLAR, 'the gate must pass the states the caller declared it handles'),
    ).toBe('arrived')
  })
})

describe('privileged roles are not ownership-scoped', () => {
  // Only `customer` and `worker` are scoped by id here, so every other role reads any job. That is
  // deliberate for `admin`, but `admin_operator` inherits it by omission rather than by decision,
  // and the only compensating control is requireNonOperatorWorkflowRole at six call sites.
  it.each([
    ['admin', 'admin'],
    ['admin_operator', 'admin_operator'],
  ])('%s reads a job it has no relationship to', async (_label, role) => {
    const { client } = jobClient(OWNED_JOB)
    const job = await requireJobAccess(client, 'job-p19', ctxFor(role, INTRUDER))
    expect(
      job.id,
      pillarWhy(
        PILLAR,
        `${role} is unscoped at this gate; if that should change, the guard here is what must change`,
      ),
    ).toBe('job-p19')
  })
})
