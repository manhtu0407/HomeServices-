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

describe('P17 monitoring and A/B setup', () => {
  it('creates admin-only monitoring views and the running price_synthesis A/B experiment', () => {
    const migration = readMigrationByName('kael_p17_monitoring_ab_setup')

    expect(migration).toContain('create table if not exists public.kael_ab_experiments')
    expect(migration).toContain('create table if not exists public.kael_ab_price_synthesis_cases')
    expect(migration).toContain("purpose text not null check (purpose = 'price_synthesis')")
    expect(migration).toContain("primary_provider public.api_provider not null")
    expect(migration).toContain("comparison_provider public.api_provider not null")
    expect(migration).toContain("sample_target integer not null default 100")
    expect(migration).toContain("'p17-price-synthesis-perplexity-vs-anthropic-2026-05-26'")
    expect(migration).toContain('create or replace view public.kael_monitoring_provider_daily')
    expect(migration).toContain('create or replace view public.kael_monitoring_ab_price_synthesis')
    expect(migration).toContain('with (security_invoker = true)')
    expect(migration).toContain("then 'reject_perplexity'")
    expect(migration).toContain("then 'collecting'")
  })

  it('keeps P17 monitoring read-only for authenticated users and service-role writable', () => {
    const migration = readMigrationByName('kael_p17_monitoring_ab_setup')

    expect(migration).toContain('alter table public.kael_ab_experiments enable row level security')
    expect(migration).toContain('alter table public.kael_ab_price_synthesis_cases enable row level security')
    expect(migration).toContain('using (private.is_admin())')
    expect(migration).toContain('revoke all on public.kael_ab_experiments from authenticated')
    expect(migration).toContain('revoke all on public.kael_ab_price_synthesis_cases from authenticated')
    expect(migration).toContain('grant select on public.kael_ab_experiments to authenticated')
    expect(migration).toContain('grant select on public.kael_ab_price_synthesis_cases to authenticated')
    expect(migration).toContain('grant all on public.kael_ab_experiments to service_role')
    expect(migration).toContain('grant all on public.kael_ab_price_synthesis_cases to service_role')
  })

  it('documents provider #6 as Perplexity primary with Anthropic fallback', () => {
    const routingConfig = read('supabase/functions/mobile-api/_shared/kael/routing.config.ts')

    expect(routingConfig).toContain(
      'price_synthesis: config("price_synthesis", perplexity(), anthropic(), 0.01, 3_000, true, 200)',
    )
  })
})
