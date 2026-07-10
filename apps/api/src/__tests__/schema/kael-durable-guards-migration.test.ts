import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationPath = new URL(
  '../../../../../supabase/migrations/20260710082120_kael_durable_guards.sql',
  import.meta.url,
)

describe('Kael durable guards migration', () => {
  it('creates the Plan section 41 circuit/rate stores with deny-all client access', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create table public.kael_provider_circuit')
    expect(sql).toContain('create table public.kael_rate_counter')
    expect(sql).toContain('alter table public.kael_provider_circuit enable row level security')
    expect(sql).toContain('alter table public.kael_rate_counter enable row level security')
    expect(sql).toMatch(/create policy[\s\S]+using \(false\)[\s\S]+with check \(false\)/)
    expect(sql).toContain('revoke all on public.kael_provider_circuit from public, anon, authenticated')
    expect(sql).toContain('revoke all on public.kael_rate_counter from public, anon, authenticated')
  })

  it('keeps circuit rules atomic, two-level, and identical to the RAM thresholds', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create or replace function public.record_circuit_failure')
    expect(sql).toContain('create or replace function public.is_circuit_open')
    expect(sql).toContain('create or replace function public.record_circuit_success')
    expect(sql).toContain("when 'credit' then")
    expect(sql).toContain("when 'rate_limit' then")
    expect(sql).toContain("when 'server' then")
    expect(sql).toContain("when 'timeout' then")
    expect(sql).toContain("when 'schema' then")
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain("scope = 'provider'")
    expect(sql).toContain("split_part(p_key, ':', 2)")
  })

  it('takes both chat buckets atomically and grants RPC execution only to service_role', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('create or replace function public.rate_take')
    expect(sql).toContain("p_config -> 'buckets'")
    expect(sql).toContain('jsonb_array_elements')
    expect(sql).toContain('on conflict (scope, key) do update')
    for (const fn of ['record_circuit_failure', 'is_circuit_open', 'record_circuit_success', 'rate_take']) {
      expect(sql).toContain(`grant execute on function public.${fn}`)
    }
    expect(sql).toContain('from public, anon, authenticated')
    expect(sql).toContain("set search_path = ''")
  })

  it('wires the default-off rollout flag without putting it in mobile config', () => {
    const env = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/env.ts', import.meta.url),
      'utf8',
    )
    const example = readFileSync(
      new URL('../../../../../config/env/workspace.env.example', import.meta.url),
      'utf8',
    )
    const provider = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/kael/provider-client.ts', import.meta.url),
      'utf8',
    )
    const services = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/services.ts', import.meta.url),
      'utf8',
    )
    const customerChat = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/services/kael-chat.service.ts', import.meta.url),
      'utf8',
    )
    const workerChat = readFileSync(
      new URL('../../../../../supabase/functions/mobile-api/_shared/services/worker-kael-chat.service.ts', import.meta.url),
      'utf8',
    )

    expect(env).toContain('KAEL_DURABLE_GUARDS_ENABLED')
    expect(example).toContain('KAEL_DURABLE_GUARDS_ENABLED=')
    expect(provider).toContain('isDurableCircuitOpen')
    expect(provider).toContain('recordDurableCircuitFailure')
    expect(provider).toContain('recordDurableCircuitSuccess')
    expect(services).toContain('durableGuardClient: ctx.supabase')
    expect(customerChat).toContain('takeDurableKaelChatRateLimit')
    expect(workerChat).toContain('takeDurableKaelChatRateLimit')
  })

  it('ships a rollback-only runtime harness for local/staging verification', () => {
    const harness = readFileSync(
      new URL('../../../../../supabase/tests/kael_durable_guards_verification.sql', import.meta.url),
      'utf8',
    )

    expect(harness.trimStart().startsWith('-- Rollback-only')).toBe(true)
    expect(harness).toMatch(/\nbegin;[\s\S]*\nrollback;\s*$/)
    expect(harness).toContain('provider-global circuit was not visible cross-purpose')
    expect(harness).toContain('blocked minute request partially consumed hour tokens')
    expect(harness).toContain("'authenticated'")
    expect(harness).toContain("'service_role'")
  })
})
