import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../../../../..')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260714103000_exact_profile_and_earnings_aggregates.sql',
)
const dailyEarningsMigrationPath = resolve(
  root,
  'supabase/migrations/20260715105143_worker_earnings_daily_aggregate.sql',
)
const workerLedgerMigrationPath = resolve(
  root,
  'supabase/migrations/20260727160000_worker_payment_ledger_commission.sql',
)

describe('exact profile and earnings aggregate migration', () => {
  it('defines service-role-only aggregate RPCs', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toMatch(/active_service_days\s+bigint/i)

    for (const functionName of [
      'get_worker_earnings_summary',
      'get_customer_profile_insights_aggregate',
      'get_worker_performance_insights_aggregate',
    ]) {
      expect(sql).toContain(`function public.${functionName}`)
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${functionName}\\([^;]+ from authenticated`, 'i'))
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${functionName}\\([^;]+ to service_role`, 'i'))
    }
  })

  it('does not retain capped list aggregation in the runtime services', () => {
    const profileService = readFileSync(
      resolve(root, 'supabase/functions/mobile-api/_shared/services/profile-insights.service.ts'),
      'utf8',
    )
    const workerService = readFileSync(
      resolve(root, 'supabase/functions/mobile-api/_shared/services/workers.service.ts'),
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

  it('adds a service-role-only daily earnings aggregate in Ho Chi Minh time', () => {
    expect(existsSync(dailyEarningsMigrationPath)).toBe(true)
    const sql = readFileSync(dailyEarningsMigrationPath, 'utf8')

    expect(sql).toMatch(/drop function if exists public\.get_worker_earnings_summary\(uuid, timestamptz, timestamptz, numeric\)/i)
    expect(sql).toMatch(/daily_earnings\s+jsonb/i)
    expect(sql).toMatch(/paid_at\s+at time zone\s+'Asia\/Ho_Chi_Minh'/i)
    expect(sql).toMatch(/order by paid_date desc\s+limit 366/i)
    expect(sql).toMatch(/jsonb_agg\([\s\S]+order by[\s\S]+desc/i)
    expect(sql).toMatch(/revoke execute on function public\.get_worker_earnings_summary\([^;]+ from authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.get_worker_earnings_summary\([^;]+ to service_role/i)
  })

  it('supersedes earnings with immutable ledger credits while keeping account balances range-independent', () => {
    expect(existsSync(workerLedgerMigrationPath)).toBe(true)
    const sql = readFileSync(workerLedgerMigrationPath, 'utf8')

    expect(sql).toContain('from public.worker_payment_ledger ledger')
    expect(sql).toContain('all_worker_ledger as')
    expect(sql).toContain("ledger.payment_state = 'available'")
    expect(sql).toContain('available_balance bigint')
    expect(sql).toContain('recent_transactions jsonb')
    expect(sql).toMatch(/revoke execute on function public\.get_worker_earnings_summary\([^;]+ from authenticated/i)
    expect(sql).toMatch(/grant execute on function public\.get_worker_earnings_summary\([^;]+ to service_role/i)
  })
})
