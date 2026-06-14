/**
 * S3 / negative security tests (Plan.md §38) — the Edge IDOR lynchpin.
 *
 * `requireJobAccess` is the ownership gate for job-scoped routes. Because the Edge
 * uses the service-role client (RLS bypassed), this function returning 404 on a
 * cross-tenant access IS the IDOR defense for reads. These tests exercise the REAL
 * logic (no canned mock responses): a mock db client returns a job owned by someone
 * else, and the function must fail closed with 404 — and crucially with the SAME
 * "not found" code/message as a genuinely-missing job (no existence leak).
 */
import { describe, expect, it } from 'vitest'
import {
  requireJobAccess,
  type JobAccessDbClient,
} from '../../../../../supabase/functions/mobile-api/_shared/access'
import type { MobileApiContext } from '../../../../../supabase/functions/mobile-api/_shared/router'

function jobClient(job: Record<string, unknown> | null, error: unknown = null): JobAccessDbClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => ({ data: job, error }),
  }
  return { from: () => chain } as unknown as JobAccessDbClient
}

function ctxFor(role: 'customer' | 'worker' | 'admin', userId: string): MobileApiContext {
  return { success: true, user: { id: userId }, role, supabase: {} } as unknown as MobileApiContext
}

const OWNED = {
  id: 'job-1',
  status: 'arrived',
  customer_id: 'owner-customer',
  worker_id: 'owner-worker',
}

describe('S3: requireJobAccess fails closed on cross-tenant access (IDOR)', () => {
  it('customer who is not the owner → 404 NOT_FOUND (no existence leak)', async () => {
    await expect(
      requireJobAccess(jobClient(OWNED), 'job-1', ctxFor('customer', 'attacker-customer')),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('worker who is not the assigned worker → 404 NOT_FOUND', async () => {
    await expect(
      requireJobAccess(jobClient(OWNED), 'job-1', ctxFor('worker', 'attacker-worker')),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('genuinely-missing job → 404 NOT_FOUND (same code as cross-tenant — no info leak)', async () => {
    await expect(
      requireJobAccess(jobClient(null), 'job-1', ctxFor('customer', 'attacker-customer')),
    ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('owning customer → returns the job', async () => {
    const job = await requireJobAccess(jobClient(OWNED), 'job-1', ctxFor('customer', 'owner-customer'))
    expect(job.id).toBe('job-1')
    expect(job.customer_id).toBe('owner-customer')
  })

  it('assigned worker → returns the job', async () => {
    const job = await requireJobAccess(jobClient(OWNED), 'job-1', ctxFor('worker', 'owner-worker'))
    expect(job.id).toBe('job-1')
  })

  it('admin bypasses the ownership check (audit Bug #6) → returns any job', async () => {
    const job = await requireJobAccess(jobClient(OWNED), 'job-1', ctxFor('admin', 'admin-1'))
    expect(job.id).toBe('job-1')
  })

  it('requiredRole mismatch → 403 AUTH_FORBIDDEN before any DB read', async () => {
    await expect(
      requireJobAccess(jobClient(OWNED), 'job-1', ctxFor('customer', 'owner-customer'), {
        requiredRole: 'worker',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'AUTH_FORBIDDEN' })
  })

  it('status-gate mismatch → 409 INVALID_STATUS for the owner', async () => {
    await expect(
      requireJobAccess(jobClient(OWNED), 'job-1', ctxFor('customer', 'owner-customer'), {
        statuses: ['completed_by_worker'],
      }),
    ).rejects.toMatchObject({ status: 409, code: 'INVALID_STATUS' })
  })
})
