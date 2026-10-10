import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { installEdgeRuntimeTestHooks } from '../kael-edge-runtime/harness'
import { getWorkerReadiness } from '../../../../../supabase/functions/mobile-api/_shared/domains/worker/readiness'

export const PILLAR = {
  id: 'P201-worker-readiness-service-reads',
  invariant:
    'the worker readiness read (workerApplications.me) gets the worker\'s application from the service-only get_current_worker_application RPC and their capacity reservations and review decision from the service client, because the client carrying the caller token has no EXECUTE on that RPC and no SELECT on either table and would answer a 42501 for every worker; the reads of the worker\'s own profile, jobs, candidates and push tokens stay on the caller token client, and every read stays keyed to the authenticated worker',
  authority: [
    'supabase/migrations/20260909010000_worker_application_revision_lineage.sql (get_current_worker_application is executable by service_role only)',
    'supabase/migrations/20260904230000_public_coverage_capacity_reservation.sql (matching_capacity_reservations is revoked from authenticated and granted to service_role)',
    'supabase/migrations/20260808113000_admin_operations_sub_admin.sql (admin_worker_application_reviews is an admin-owned table with no authenticated select)',
    'governance/RULES.md #0 (Edge owns service-role access and sensitive validation)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/worker/readiness.ts',
  layer: 'security-negative',
  siblings: ['P200-user-routes-service-owned-writes', 'P199-customer-service-owned-routes'],
  mutation:
    'replace `service` with `client` in the get_current_worker_application call, in the matching_capacity_reservations read, or in the admin_worker_application_reviews read — the matching case turns red because that read lands on the client production refuses. Each was observed',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const WORKER = '33333333-3333-4333-8333-333333333333'
const APPLICATION = '55555555-5555-4555-8555-555555555555'
const STAMP = '2026-09-21T00:00:00.000Z'

type Reply = { data: unknown; error: unknown }

const refused = (name: string): Reply => ({
  data: null,
  error: { code: '42501', message: `permission denied for the ${name} client` },
})
const ok: Reply = { data: null, error: null }

/** A query builder that records every call and resolves once awaited. */
function chain(reply: () => Reply, onCall: (method: string, args: unknown[]) => void) {
  const query: unknown = new Proxy(() => undefined, {
    apply: () => query,
    get: (_target, property) => {
      if (property === 'then') {
        return (resolve: (value: Reply) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(reply()).then(resolve, reject)
      }
      return (...args: unknown[]) => {
        onCall(String(property), args)
        return query
      }
    },
  })
  return query
}

/**
 * The caller's own client as production has it: it reads the worker's own rows, but has no SELECT on
 * the tables in `refusedReads` and no EXECUTE on any function.
 */
function client(
  name: 'service' | 'user',
  log: string[],
  options: { refusedReads?: string[]; canRpc: boolean; tables?: Record<string, Reply[]>; rpc?: Record<string, Reply> },
) {
  return {
    from: (table: string) => {
      log.push(`${name}:from:${table}`)
      return chain(
        () => options.refusedReads?.includes(table) ? refused(name) : options.tables?.[table]?.shift() ?? ok,
        (method, args) => log.push(`${name}:${table}.${method}(${args.map((arg) => JSON.stringify(arg)).join(',')})`),
      )
    },
    rpc: (fn: string, args: unknown) => {
      log.push(`${name}:rpc:${fn}(${JSON.stringify(args)})`)
      return Promise.resolve(options.canRpc ? options.rpc?.[fn] ?? ok : refused(name))
    },
  }
}

function setup(service: { tables?: Record<string, Reply[]>; rpc?: Record<string, Reply> }) {
  const log: string[] = []
  const serviceClient = client('service', log, { canRpc: true, ...service })
  const userClient = client('user', log, {
    canRpc: false,
    refusedReads: ['matching_capacity_reservations', 'admin_worker_application_reviews'],
    tables: {
      profiles: [{ data: { role: 'worker' }, error: null }],
      worker_profiles: [{ data: { id: WORKER, verification_status: 'approved', is_approved: true, is_available: true }, error: null }],
      jobs: [{ data: [], error: null }],
      job_worker_candidates: [{ data: [], error: null }],
    },
  })
  const context = {
    role: 'worker',
    user: { id: WORKER },
    supabase: userClient,
    privilegedSupabase: serviceClient,
  } as never
  const calls = (clientName: string, target: string) => log.filter((entry) => entry.startsWith(`${clientName}:${target}`))
  return { context, log, calls }
}

const APPLICATION_ROW = { data: [{ id: APPLICATION, created_at: STAMP, safe_metadata: {} }], error: null }
const REVIEW_ROW = { data: { decision: 'approve', reason: null, decided_at: STAMP }, error: null }

describe('P201 worker readiness — the reads only the service client can make', () => {
  it('reads the application, reservations and review on the service client and everything else as the worker', async () => {
    const { context, log, calls } = setup({
      rpc: { get_current_worker_application: APPLICATION_ROW },
      tables: {
        matching_capacity_reservations: [{ data: [{ id: 'reservation-1' }], error: null }],
        admin_worker_application_reviews: [REVIEW_ROW],
      },
    })

    const readiness = await getWorkerReadiness(context)

    expect(readiness.application, pillarWhy(PILLAR, 'the review decision could only be read on the service client')).toMatchObject({
      application_id: APPLICATION,
      status: 'approved',
    })
    expect(readiness.capacity.active_reservation, pillarWhy(PILLAR, 'the reservation read could only run on the service client')).toBe(true)
    expect(
      calls('service', 'rpc:get_current_worker_application'),
      pillarWhy(PILLAR, 'authenticated has no EXECUTE on the application RPC'),
    ).toEqual([`service:rpc:get_current_worker_application({"p_actor_id":"${WORKER}"})`])
    expect(calls('service', 'from:matching_capacity_reservations'), pillarWhy(PILLAR, 'authenticated has no SELECT on it')).toHaveLength(1)
    expect(calls('service', 'from:admin_worker_application_reviews'), pillarWhy(PILLAR, 'authenticated has no SELECT on it')).toHaveLength(1)
    for (const table of ['profiles', 'worker_profiles', 'jobs', 'job_worker_candidates']) {
      expect(log, pillarWhy(PILLAR, `${table} is the worker's own data and stays on the caller token client`)).toContain(`user:from:${table}`)
    }
    expect(
      log.filter((entry) => entry.startsWith('user:') && /matching_capacity_reservations|admin_worker_application_reviews|:rpc:/.test(entry)),
      pillarWhy(PILLAR, 'the caller token client must not be asked for what it is refused'),
    ).toEqual([])
  })

  it('keeps every read keyed to the authenticated worker or to their own application', async () => {
    const { context, calls } = setup({
      rpc: { get_current_worker_application: APPLICATION_ROW },
      tables: {
        matching_capacity_reservations: [{ data: [], error: null }],
        admin_worker_application_reviews: [REVIEW_ROW],
      },
    })

    await getWorkerReadiness(context)

    expect(calls('user', 'profiles.eq')).toEqual([`user:profiles.eq("id","${WORKER}")`])
    expect(calls('user', 'worker_profiles.eq')).toEqual([`user:worker_profiles.eq("id","${WORKER}")`])
    expect(calls('user', 'jobs.eq')).toEqual([`user:jobs.eq("worker_id","${WORKER}")`])
    expect(calls('user', 'job_worker_candidates.eq')).toContain(`user:job_worker_candidates.eq("worker_id","${WORKER}")`)
    expect(
      calls('service', 'matching_capacity_reservations.eq'),
      pillarWhy(PILLAR, 'the service client bypasses RLS, so the reservation read must still be scoped to the worker'),
    ).toContain(`service:matching_capacity_reservations.eq("worker_id","${WORKER}")`)
    expect(
      calls('service', 'admin_worker_application_reviews.eq'),
      pillarWhy(PILLAR, 'the review is read only for the application the RPC returned for this worker'),
    ).toEqual([`service:admin_worker_application_reviews.eq("queue_id","${APPLICATION}")`])
  })

  it('does not count completed jobs awaiting payment as current Worker capacity', async () => {
    const { context, log } = setup({
      rpc: { get_current_worker_application: APPLICATION_ROW },
      tables: {
        matching_capacity_reservations: [{ data: [], error: null }],
        admin_worker_application_reviews: [REVIEW_ROW],
      },
    })

    await getWorkerReadiness(context)

    const statusFilter = log.find((entry) => entry.startsWith('user:jobs.in("status",'))
    expect(statusFilter).toBeDefined()
    expect(statusFilter).not.toContain('"payment_pending"')
  })

  it('does not read a review when the worker has no application', async () => {
    const { context, calls } = setup({
      rpc: { get_current_worker_application: { data: [], error: null } },
      tables: { matching_capacity_reservations: [{ data: [], error: null }] },
    })

    await getWorkerReadiness(context)

    expect(calls('service', 'from:admin_worker_application_reviews')).toEqual([])
  })

  it('fails closed when the service RPC reports an error', async () => {
    const { context } = setup({
      rpc: { get_current_worker_application: { data: null, error: { code: 'XX000', message: 'boom' } } },
      tables: { matching_capacity_reservations: [{ data: [], error: null }] },
    })

    await expect(getWorkerReadiness(context)).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
  })
})
