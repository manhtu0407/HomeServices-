import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL(
  '../../../../../supabase/migrations/20260813123736_scope_change_worker_price_confirmation.sql',
  import.meta.url,
), 'utf8')

describe('scope-change worker price confirmation', () => {
  it('stores a short-lived quote against the exact incident revision', () => {
    expect(sql).toContain('scope_price_quote_id uuid')
    expect(sql).toContain('scope_price_quote_revision integer')
    expect(sql).toContain('scope_price_quote_expires_at timestamptz')
    expect(sql).toContain('save_job_incident_scope_price_quote_atomic')
    expect(sql).toContain('v_incident.revision is distinct from p_expected_revision')
    expect(sql).toContain("p_quote_expires_at > v_now + interval '30 minutes'")
  })

  it('requires the same unexpired quote when the worker submits a proposal', () => {
    expect(sql).toContain('p_quote_id uuid')
    expect(sql).toContain('v_incident.scope_price_quote_id is distinct from p_quote_id')
    expect(sql).toContain('v_incident.scope_price_quote_revision is distinct from v_incident.revision')
    expect(sql).toContain('v_incident.scope_price_quote_expires_at <= v_now')
    expect(sql).toContain('scope_price_quote_confirmed_at = v_now')
  })

  it('rejects customer-visible proposals not bound to the worker-confirmed breakdown', () => {
    expect(sql).toContain('guard_scope_change_worker_quote_binding')
    expect(sql).toContain("new.kael_review #>> '{worker_price_confirmation,quote_id}'")
    expect(sql).toContain("new.kael_review #>> '{stakeholder_balance,platform_fee}'")
    expect(sql).toContain("new.kael_review #>> '{stakeholder_balance,worker_net}'")
    expect(sql).toContain('scope change is not bound to the worker-confirmed quote')
  })

  it('keeps quote mutation RPCs service-role only', () => {
    expect(sql).toMatch(/revoke execute on function public\.save_job_incident_scope_price_quote_atomic[\s\S]*from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.save_job_incident_scope_price_quote_atomic[\s\S]*to service_role/)
    expect(sql).toMatch(/revoke execute on function public\.claim_job_incident_scope_proposal_atomic[\s\S]*from public, anon, authenticated/)
  })
})
