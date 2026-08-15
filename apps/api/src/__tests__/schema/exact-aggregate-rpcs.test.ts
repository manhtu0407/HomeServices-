import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')

describe('exact profile and earnings aggregates', () => {
  it('does not retain capped list aggregation in the runtime services', () => {
    const profileService = [
      'supabase/functions/mobile-api/_shared/domains/customer/profile-insights.ts',
      'supabase/functions/mobile-api/_shared/domains/worker/profile-insights.ts',
    ].map((path) => readFileSync(resolve(root, path), 'utf8')).join('\n')
    const workerService = readFileSync(
      resolve(root, 'supabase/functions/mobile-api/_shared/domains/worker/earnings.ts'),
      'utf8',
    )
    const nextEarnings = readFileSync(
      resolve(root, 'apps/api/src/lib/workers/earnings.ts'),
      'utf8',
    )

    expect(profileService).not.toMatch(/\.limit\(/)
    expect(profileService).toContain('get_customer_profile_insights_aggregate')
    expect(profileService).toContain('get_worker_performance_insights_aggregate')
    expect(workerService).toContain('get_worker_earnings_summary')
    expect(nextEarnings).toContain('get_worker_earnings_summary')
  })

  it('allows the customer-scoped runtime to execute its RLS-bound aggregate', () => {
    const migration = readFileSync(
      resolve(root, 'supabase/migrations/20260815121242_customer_read_endpoint_parity.sql'),
      'utf8',
    )

    expect(migration).toContain(
      'grant execute on function public.get_customer_profile_insights_aggregate(uuid) to authenticated;',
    )
    expect(migration).not.toContain('security definer')
  })
})
