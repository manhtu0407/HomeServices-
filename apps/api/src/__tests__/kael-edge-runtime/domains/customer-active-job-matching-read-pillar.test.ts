import { describe, expect, it } from 'vitest'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

export const PILLAR = {
  id: 'P246-customer-active-matching-service-read',
  invariant: 'An owned Customer job keeps its matching receipt while service-only operation state is read through the privileged Edge client',
  authority: ['governance/RULES.md #0 (service-role access stays in Edge)', 'Production matching_operations grant is service_role only'],
  target: 'supabase/functions/mobile-api/_shared/domains/matching/matching-preference-read.ts',
  layer: 'integration',
  siblings: ['P104-customer-matching-retry-http', 'P109-matching-selection-http'],
  mutation: 'Read matching_operations through the Customer-scoped client; the route reproduces SQLSTATE 42501 and the security-negative client assertion fails',
} as const satisfies PillarManifest

const JOB = 'e2460000-0000-4000-8000-000000000001'
const CUSTOMER = 'e2460000-0000-4000-8000-000000000002'

describe('Customer active job matching-state client boundary', () => {
  installEdgeRuntimeTestHooks()

  it('returns the owned job receipt without querying the service-only table as Customer', async () => {
    const customerClient = makeSequenceClient([], {}, {
      synthetic_matching_cohort_members: [{ data: null, error: null }],
      jobs: [
        { data: [{ id: JOB }], error: null },
        {
          data: {
            id: JOB,
            status: 'awaiting_customer_confirm',
            service_type: 'plumbing',
            description: 'Leak under sink',
            problem_chips: ['Leak'],
            photo_urls: [],
            address_district: 'q7',
            customer_id: CUSTOMER,
            worker_id: null,
            created_at: '2026-09-27T00:00:00.000Z',
          },
          error: null,
        },
      ],
      job_matching_preferences: [{
        data: { strategy: 'general', auto_general: true, fallback_at: null },
        error: null,
      }],
      job_broadcasts: [{ data: [], error: null }],
      job_events: [{ data: [], error: null }],
      matching_operations: [{
        data: null,
        error: { code: '42501', message: 'permission denied for table matching_operations' },
      }],
    })
    const privilegedClient = makeSequenceClient([], {}, {
      matching_operations: [{ data: { state: 'queued' }, error: null }],
    })
    const ctx: Parameters<ReturnType<typeof createEdgeServices>['listCustomerActiveJobs']>[0] = {
      success: true,
      user: { id: CUSTOMER },
      role: 'customer',
      supabase: customerClient,
      privilegedSupabase: privilegedClient,
    }

    const result = await createEdgeServices({}).listCustomerActiveJobs(ctx)

    expect(result.active_job?.matching_state, pillarWhy(PILLAR, 'owned job reads must keep the matching receipt')).toMatchObject({
      strategy: 'general',
    })
    expect(
      customerClient.calls.some((call) => call.table === 'matching_operations'),
      pillarWhy(PILLAR, 'the Customer-scoped client has no grant for matching_operations'),
    ).toBe(false)
    expect(
      privilegedClient.calls.some((call) => call.table === 'matching_operations'),
      pillarWhy(PILLAR, 'the service client must read only the internal matching operation state'),
    ).toBe(true)
  })
})