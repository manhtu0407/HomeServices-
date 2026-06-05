import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(process.cwd(), '../..')

function read(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('Kael Track D guardrail observability schema', () => {
  it('adds an append-only guardrail trip audit table with admin-read/service-role-write RLS', () => {
    const migration = read('supabase/migrations/20260604221500_kael_d_guardrail_trip_audit.sql')
    const selfCheck = read('supabase/functions/mobile-api/_shared/kael/self-check.ts')

    expect(migration).toContain('create table if not exists public.kael_guardrail_trip_audit')
    expect(migration).toContain("source text not null check (source in ('self_check', 'semantic_self_check', 'boundary_guard', 'autonomy_gate'))")
    expect(migration).toContain('alter table public.kael_guardrail_trip_audit enable row level security')
    expect(migration).toContain('create policy "Admins view kael guardrail trip audit"')
    expect(migration).toContain('grant select on public.kael_guardrail_trip_audit to authenticated')
    expect(migration).toContain('grant all on public.kael_guardrail_trip_audit to service_role')
    expect(selfCheck).toContain('kael_guardrail_trip_audit')
  })
})
