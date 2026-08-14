import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(new URL(
  '../../../../../supabase/migrations/20260813123726_guard_verified_scope_change_final_price.sql',
  import.meta.url,
), 'utf8')

describe('scope-change verified final-price guard', () => {
  it('requires a sourced point price inside the reference band for new proposals', () => {
    expect(sql).toContain('scope_change_waiting_requires_verified_case_price')
    expect(sql).toContain('kael_computed_min = kael_computed_max')
    expect(sql).toContain("kael_review ->> 'price_source' = 'verified_baseline'")
    expect(sql).toContain("selection_rule' = 'verified_neutral_midpoint_with_bilateral_confirmation'")
    expect(sql).toContain("worker_price_confirmation,confirmed")
    expect(sql).toContain("stakeholder_balance,worker_net")
    expect(sql).toContain('not valid')
  })

  it('blocks direct RPC approval of historical proposals without the same receipt', () => {
    expect(sql).toContain('guard_verified_scope_change_approval()')
    expect(sql).toContain("new.status = 'approved_by_customer'")
    expect(sql).toContain('scope change final price lacks verified case receipt')
    expect(sql).toContain('before update of status on public.scope_change_requests')
  })
})
