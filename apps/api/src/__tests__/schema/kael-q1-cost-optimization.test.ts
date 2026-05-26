import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')
const readMigrationByName = (needle: string) => {
  const dir = resolve(ROOT, 'supabase/migrations')
  const name = readdirSync(dir)
    .filter((item) => item.endsWith('.sql') && item.includes(needle))
    .sort()
    .at(-1)
  return name ? read(`supabase/migrations/${name}`) : ''
}

describe('Q1 cost optimization baseline telemetry', () => {
  it('creates cost dashboard, baseline, and optimization metric schema', () => {
    const migration = readMigrationByName('kael_cost_optimization_q1')

    expect(migration).toContain('create table if not exists public.kael_quality_baseline')
    expect(migration).toContain('create table if not exists public.kael_optimization_metrics')
    expect(migration).toContain('create or replace view public.kael_cost_daily_summary')
    expect(migration).toContain('create or replace view public.kael_cost_projection_daily')
    expect(migration).toContain('with (security_invoker = true)')
    expect(migration).toContain('projected_1000_jobs_usd')
    expect(migration).toContain('projected_10000_jobs_usd')
  })

  it('keeps Q1 telemetry admin-readable and service-role writable only', () => {
    const migration = readMigrationByName('kael_cost_optimization_q1')

    for (const table of [
      'public.kael_quality_baseline',
      'public.kael_optimization_metrics',
    ]) {
      expect(migration).toContain(`alter table ${table} enable row level security`)
      expect(migration).toContain(`revoke all on ${table} from authenticated`)
      expect(migration).toContain(`grant select on ${table} to authenticated`)
      expect(migration).toContain(`grant all on ${table} to service_role`)
    }
    expect(migration).toContain('using (private.is_admin())')
  })

  it('hooks Edge api_logs into optimization metrics without enabling optimizations', () => {
    const services = read('supabase/functions/mobile-api/_shared/services.ts')
    const costTracking = read('supabase/functions/mobile-api/_shared/kael/cost-tracking.ts')

    expect(services).toContain('buildKaelOptimizationMetricRows(rows)')
    expect(services).toContain('client.from("kael_optimization_metrics").insert(metricRows)')
    expect(costTracking).toContain('KAEL_OPT_PROMPT_CACHE_ENABLED')
    expect(costTracking).toContain('KAEL_OPT_CAP_OUTPUT_ENABLED')
    expect(costTracking).toContain('KAEL_OPT_MARKET_CACHE_ENABLED')
    expect(costTracking).toContain('KAEL_OPT_BATCH_LEARNING_ENABLED')
    expect(costTracking).toContain('KAEL_OPT_BATCH_API_ENABLED')
    expect(costTracking).toContain('return false')
  })
})
