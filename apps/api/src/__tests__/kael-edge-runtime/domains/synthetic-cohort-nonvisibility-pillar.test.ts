import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'
import { listCustomerServiceHistory } from '../../../../../../supabase/functions/mobile-api/_shared/domains/job/customer-history'
import { listCustomerActiveJobs } from '../../../../../../supabase/functions/mobile-api/_shared/domains/job/read'
import { saveCustomerFavoriteWorker } from '../../../../../../supabase/functions/mobile-api/_shared/domains/customer/favorite-worker'
import {
  getCustomerRefundAccount,
  saveCustomerRefundAccount,
} from '../../../../../../supabase/functions/mobile-api/_shared/domains/customer/refund-account'
import { hasSavedWorker } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/matching-preference-read'
import { listWorkerJobs } from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/jobs'
import { getWorkerEarnings } from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/earnings'
import { getWorkerPayoutMethod } from '../../../../../../supabase/functions/mobile-api/_shared/domains/worker/payout'
import { listAdminTransactions } from '../../../../../../supabase/functions/mobile-api/_shared/domains/admin/transactions'
import { listAdminWorkerApplications } from '../../../../../../supabase/functions/mobile-api/_shared/domains/admin/control'
import { listKaelAdminQueue } from '../../../../../../supabase/functions/mobile-api/_shared/domains/admin/queue'
import { listAdminPayoutMethods } from '../../../../../../supabase/functions/mobile-api/_shared/domains/admin/payout'
import { listAdminDisputes } from '../../../../../../supabase/functions/mobile-api/_shared/domains/admin/governance'
import {
  resolveSyntheticActorScope,
  requireRealTrafficActor,
  scopeQueryToSyntheticActor,
} from '../../../../../../supabase/functions/mobile-api/_shared/platform/synthetic-cohort'
import type { MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/platform/auth'
import type { Chain, DbClient } from '../../../../../../supabase/functions/mobile-api/_shared/platform/db'

export const PILLAR = {
  id: 'P54-synthetic-cohort-nonvisibility',
  invariant:
    'service-role reads keep real actors on rows whose synthetic cohort is null, keep synthetic actors inside their exact cohort, and fail closed when cohort identity cannot be resolved',
  authority: [
    'governance/RULES.md #8 (fake success and silent degradation are forbidden)',
    'governance/STRUCTURES.md §22.3 (service-role access stays behind Edge ownership guards)',
    'Approved Stage 1 plan §3 (synthetic actors never appear in real-user queries, analytics, favorites, or payouts)',
  ],
  target: 'supabase/functions/mobile-api/_shared/platform/synthetic-cohort.ts',
  layer: 'security-negative',
  siblings: ['P10-per-actor-rls', 'P19-job-access-ownership', 'P50-reachable-cohort-matching'],
  mutation:
    'replace the null-cohort `.is` branch with an unfiltered return — the real customer history, favorite, worker jobs, and admin transaction cases expose the missing operation',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const CUSTOMER_ID = '54000000-0000-4000-8000-000000000001'
const WORKER_ID = '54000000-0000-4000-8000-000000000002'
const ADMIN_ID = '54000000-0000-4000-8000-000000000003'
const COHORT_ID = 'synthetic-p54-alpha'

function ctxFor(client: unknown, role: 'customer' | 'worker' | 'admin', userId: string) {
  return {
    success: true,
    user: { id: userId },
    role,
    supabase: client,
    privilegedSupabase: client,
  } as unknown as MobileApiContext
}

function operationWasRecorded(
  client: ReturnType<typeof makeSequenceClient>,
  table: string,
  operation: unknown[],
) {
  return client.calls
    .filter((call) => call.table === table)
    .some((call) => call.operations.some((candidate) =>
      JSON.stringify(candidate) === JSON.stringify(operation)
    ))
}

describe('synthetic cohort query scope', () => {
  it('uses an explicit null predicate for real traffic and exact equality for synthetic traffic', () => {
    const realClient = makeSequenceClient([])
    const realQuery = realClient.from('jobs') as unknown as Chain
    scopeQueryToSyntheticActor(realQuery, { cohortId: null })

    expect(
      operationWasRecorded(realClient, 'jobs', ['is', 'synthetic_cohort_id', null]),
      pillarWhy(PILLAR, 'real traffic must never rely on absence of a filter'),
    ).toBe(true)

    const syntheticClient = makeSequenceClient([])
    const syntheticQuery = syntheticClient.from('jobs') as unknown as Chain
    scopeQueryToSyntheticActor(syntheticQuery, { cohortId: COHORT_ID })

    expect(
      operationWasRecorded(syntheticClient, 'jobs', ['eq', 'synthetic_cohort_id', COHORT_ID]),
      pillarWhy(PILLAR, 'a synthetic actor must remain in its exact cohort'),
    ).toBe(true)
  })

  it('fails closed when the service-role cohort lookup errors or returns a malformed identity', async () => {
    const errorClient = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: null, error: { code: 'DB_DOWN' } }],
    })
    await expect(
      resolveSyntheticActorScope(errorClient as unknown as DbClient, CUSTOMER_ID, 'customer'),
      pillarWhy(PILLAR, 'a failed lookup cannot be interpreted as a real actor'),
    ).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })

    const malformedClient = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: { cohort_id: 'not-a-cohort' }, error: null }],
    })
    await expect(
      resolveSyntheticActorScope(malformedClient as unknown as DbClient, CUSTOMER_ID, 'customer'),
      pillarWhy(PILLAR, 'an invalid cohort identity cannot widen the query to real rows'),
    ).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
  })

  it('blocks synthetic actors from financial and payout surfaces', async () => {
    const client = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: { cohort_id: COHORT_ID }, error: null }],
    })

    await expect(
      requireRealTrafficActor(client as unknown as DbClient, WORKER_ID, 'worker'),
      pillarWhy(PILLAR, 'Production smoke must stop before any money or payout path'),
    ).rejects.toMatchObject({ code: 'SYNTHETIC_COHORT_RESTRICTED', status: 403 })
  })

  it('blocks Worker earnings and payout entrypoints before a financial query runs', async () => {
    const earningsClient = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: { cohort_id: COHORT_ID }, error: null }],
    })
    await expect(
      getWorkerEarnings(ctxFor(earningsClient, 'worker', WORKER_ID), {}),
      pillarWhy(PILLAR, 'a synthetic Worker cannot enter aggregate earnings RPCs'),
    ).rejects.toMatchObject({ code: 'SYNTHETIC_COHORT_RESTRICTED', status: 403 })
    expect(earningsClient.calls.some((call) => call.table === 'get_worker_earnings_summary_v2')).toBe(false)

    const payoutClient = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: { cohort_id: COHORT_ID }, error: null }],
    })
    await expect(
      getWorkerPayoutMethod(ctxFor(payoutClient, 'worker', WORKER_ID)),
      pillarWhy(PILLAR, 'Production synthetic smoke must stop before payout account access'),
    ).rejects.toMatchObject({ code: 'SYNTHETIC_COHORT_RESTRICTED', status: 403 })
    expect(payoutClient.calls.some((call) => call.table === 'worker_payout_methods')).toBe(false)
  })
})

describe('real-user consumers are scoped even though Edge uses service-role', () => {
  it('keeps customer service history on non-synthetic jobs', async () => {
    const client = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: null, error: null }],
      jobs: [{ data: [], error: null }],
    })

    await listCustomerServiceHistory(ctxFor(client, 'customer', CUSTOMER_ID))

    expect(
      operationWasRecorded(client, 'jobs', ['is', 'synthetic_cohort_id', null]),
      pillarWhy(PILLAR, 'history is a real-user marketplace surface'),
    ).toBe(true)
  })

  it('keeps a synthetic customer history inside the exact cohort', async () => {
    const client = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: { cohort_id: COHORT_ID }, error: null }],
      jobs: [{ data: [], error: null }],
    })

    await listCustomerServiceHistory(ctxFor(client, 'customer', CUSTOMER_ID))

    expect(
      operationWasRecorded(client, 'jobs', ['eq', 'synthetic_cohort_id', COHORT_ID]),
      pillarWhy(PILLAR, 'synthetic smoke must still be able to recover its own job'),
    ).toBe(true)
  })

  it('keeps the active-job bootstrap and saved-worker check on real traffic', async () => {
    const activeClient = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: null, error: null }],
      jobs: [{ data: [], error: null }],
    })
    await listCustomerActiveJobs(ctxFor(activeClient, 'customer', CUSTOMER_ID))
    expect(
      operationWasRecorded(activeClient, 'jobs', ['is', 'synthetic_cohort_id', null]),
      pillarWhy(PILLAR, 'home bootstrap must not surface a synthetic active job'),
    ).toBe(true)

    const favoriteClient = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: null, error: null }],
      customer_favorite_workers: [{ data: [], error: null }],
    })
    await hasSavedWorker(ctxFor(favoriteClient, 'customer', CUSTOMER_ID))
    expect(
      operationWasRecorded(favoriteClient, 'customer_favorite_workers', ['is', 'synthetic_cohort_id', null]),
      pillarWhy(PILLAR, 'a stale cross-cohort favorite cannot enable direct rebooking'),
    ).toBe(true)
  })

  it('prevents a real customer from saving a synthetic worker', async () => {
    const client = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: null, error: null }],
      worker_profiles: [{ data: { id: WORKER_ID }, error: null }],
      customer_favorite_workers: [{ data: null, error: null }],
    })

    await saveCustomerFavoriteWorker(ctxFor(client, 'customer', CUSTOMER_ID), WORKER_ID)

    expect(
      operationWasRecorded(client, 'worker_profiles', ['is', 'synthetic_cohort_id', null]),
      pillarWhy(PILLAR, 'favorite writes must validate the worker in the caller cohort'),
    ).toBe(true)
  })

  it('keeps non-privileged refund reads and writes usable for real customers', async () => {
    const readClient = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: null, error: null }],
      customer_payment_methods: [{ data: null, error: null }],
    })
    await expect(getCustomerRefundAccount(ctxFor(readClient, 'customer', CUSTOMER_ID)))
      .resolves.toEqual({ refund_account: null })

    const savedRow = {
      id: '54000000-0000-4000-8000-000000000010',
      bank_key: 'techcombank',
      bank_name: 'Techcombank',
      bank_account_masked: '**** 6789',
      status: 'pending_verification',
      is_default: true,
      verified_at: null,
      updated_at: '2026-08-23T04:00:00.000Z',
    }
    const writeClient = makeSequenceClient([], {
      upsert_customer_refund_payment_method: [{ data: [savedRow], error: null }],
    }, {
      synthetic_matching_cohort_members: [{ data: null, error: null }],
    })
    await expect(saveCustomerRefundAccount(
      ctxFor(writeClient, 'customer', CUSTOMER_ID),
      {
        account_holder_name: 'PHAN MANH TU',
        bank_account: '123456789',
        bank_key: 'techcombank',
      },
    )).resolves.toEqual({ refund_account: savedRow })
  })

  it('blocks a synthetic customer before refund-account data or RPC access', async () => {
    const client = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: { cohort_id: COHORT_ID }, error: null }],
    })

    await expect(getCustomerRefundAccount(ctxFor(client, 'customer', CUSTOMER_ID)))
      .rejects.toMatchObject({ code: 'SYNTHETIC_COHORT_RESTRICTED', status: 403 })
    expect(client.calls.some((call) => call.table === 'customer_payment_methods')).toBe(false)
  })

  it('scopes both assigned and proposed Worker jobs to the worker cohort', async () => {
    const client = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: null, error: null }],
      jobs: [{ data: [], error: null }],
      job_worker_candidates: [{ data: [], error: null }],
    })

    await listWorkerJobs(ctxFor(client, 'worker', WORKER_ID))

    expect(
      operationWasRecorded(client, 'jobs', ['is', 'synthetic_cohort_id', null]),
      pillarWhy(PILLAR, 'the assigned-job inbox must exclude synthetic jobs for a real worker'),
    ).toBe(true)
    expect(
      operationWasRecorded(client, 'job_worker_candidates', ['is', 'synthetic_cohort_id', null]),
      pillarWhy(PILLAR, 'the candidate inbox must exclude synthetic proposals for a real worker'),
    ).toBe(true)
  })

  it('keeps ordinary Admin transaction reads on real traffic only', async () => {
    const client = makeSequenceClient([], {}, {
      jobs: [{ data: [], error: null, count: 0 }],
    })

    await listAdminTransactions(ctxFor(client, 'admin', ADMIN_ID), {
      limit: 20,
      offset: 0,
      payment_status: 'all',
      query: '',
    })

    expect(
      operationWasRecorded(client, 'jobs', ['is', 'synthetic_cohort_id', null]),
      pillarWhy(PILLAR, 'the normal Admin transaction surface is not a synthetic smoke console'),
    ).toBe(true)
  })

  it('keeps Admin worker queues, payout reads, and disputes on real traffic only', async () => {
    const applicationsClient = makeSequenceClient([], {}, {
      kael_admin_queue: [{ data: [], error: null, count: 0 }],
    })
    await listAdminWorkerApplications(ctxFor(applicationsClient, 'admin', ADMIN_ID), {
      status: 'all',
      query: '',
      limit: 20,
      offset: 0,
    })
    expect(
      operationWasRecorded(applicationsClient, 'kael_admin_queue', ['is', 'synthetic_cohort_id', null]),
      pillarWhy(PILLAR, 'synthetic applications cannot enter the ordinary Admin review queue'),
    ).toBe(true)

    const queueClient = makeSequenceClient([], {}, {
      kael_admin_queue: [{ data: [], error: null }],
    })
    await listKaelAdminQueue(ctxFor(queueClient, 'admin', ADMIN_ID), { page: 1, limit: 20 })
    expect(
      operationWasRecorded(queueClient, 'kael_admin_queue', ['is', 'synthetic_cohort_id', null]),
      pillarWhy(PILLAR, 'the general Admin queue excludes the synthetic cohort'),
    ).toBe(true)

    const payoutClient = makeSequenceClient([], {}, {
      worker_payout_methods: [{ data: [], error: null, count: 0 }],
    })
    await listAdminPayoutMethods(ctxFor(payoutClient, 'admin', ADMIN_ID), {
      status: 'all',
      limit: 20,
    })
    expect(
      operationWasRecorded(payoutClient, 'worker_payout_methods', ['is', 'synthetic_cohort_id', null]),
      pillarWhy(PILLAR, 'payout administration is a real-money surface'),
    ).toBe(true)

    const disputeClient = makeSequenceClient([], {}, {
      disputes: [{ data: [], error: null, count: 0 }],
    })
    await listAdminDisputes(ctxFor(disputeClient, 'admin', ADMIN_ID), { limit: 20, offset: 0 })
    expect(
      operationWasRecorded(disputeClient, 'disputes', ['is', 'synthetic_cohort_id', null]),
      pillarWhy(PILLAR, 'synthetic match diagnostics cannot appear as real customer disputes'),
    ).toBe(true)
  })
})
