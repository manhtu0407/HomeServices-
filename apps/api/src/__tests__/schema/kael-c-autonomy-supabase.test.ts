import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(process.cwd(), '../..')

function read(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('Kael Track C autonomy Supabase contract', () => {
  it('creates an autonomy audit table with admin-read/service-role-write RLS', () => {
    const migration = read('supabase/migrations/20260604220000_kael_c_autonomy_audit_apply.sql')

    expect(migration).toContain('create table if not exists public.kael_autonomy_decision_audit')
    expect(migration).toContain("gate_result text not null check (gate_result in ('allow', 'reject', 'escalate'))")
    expect(migration).toContain('alter table public.kael_autonomy_decision_audit enable row level security')
    expect(migration).toContain('create policy "Admins view kael autonomy decision audit"')
    expect(migration).toContain('grant select on public.kael_autonomy_decision_audit to authenticated')
    expect(migration).toContain('grant all on public.kael_autonomy_decision_audit to service_role')
  })

  it('adds a service-role apply RPC that only consumes an allowed gate audit row', () => {
    const migration = read('supabase/migrations/20260604220000_kael_c_autonomy_audit_apply.sql')
    const lintFix = read('supabase/migrations/20260605004000_fix_plan31_rpc_lint_warnings.sql')

    expect(migration).toContain('create or replace function public.apply_kael_autonomy_decision')
    expect(migration).toContain("v_audit.gate_result <> 'allow'")
    expect(migration).toContain('p_expected_from')
    expect(migration).toContain('p_to_status')
    expect(migration).toContain('where id = p_job_id')
    expect(migration).toContain('and status = p_expected_from')
    expect(migration).toContain("grant execute on function public.apply_kael_autonomy_decision")
    expect(migration).toContain('to service_role')
    expect(lintFix).toContain('create or replace function public.apply_kael_autonomy_decision')
    expect(lintFix).not.toContain('v_job public.jobs%rowtype')
    expect(lintFix).not.toContain('returning * into v_job')
  })

  it('routes narrow autonomy escalations through the existing admin queue vocabulary', () => {
    const migration = read('supabase/migrations/20260604220000_kael_c_autonomy_audit_apply.sql')
    const gate = read('supabase/functions/mobile-api/_shared/kael/kael-guardrails/autonomy-gate.ts')

    expect(migration).toContain("'autonomy_escalation'")
    expect(gate).toContain('queue_type: "autonomy_escalation"')
    expect(gate).toContain('HIGH_STAKES_LOW_CONFIDENCE')
  })

  it('keeps full LLM-proposed autonomy behind the production-off flag', () => {
    const gate = read('supabase/functions/mobile-api/_shared/kael/kael-guardrails/autonomy-gate.ts')

    expect(gate).toContain('KAEL_AUTONOMY_FULL_ENABLED')
    expect(gate).toContain('AUTONOMY_FULL_FLAG_OFF')
    expect(gate).toContain('source === "llm_proposed"')
  })
})
