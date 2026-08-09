import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../../')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('Kael agentic completeness migrations', () => {
  it('adds structured idempotent feedback schema for both actors', () => {
    const sql = read('supabase/migrations/20260807090000_kael_structured_feedback.sql')
    expect(sql).toContain("check (source in ('profile', 'customer_chat'))")
    expect(sql).toContain('unique (customer_id, response_id)')
    expect(sql).toContain('unique (worker_id, response_id)')
    expect(sql).toContain("rating in ('useful', 'not_useful')")
  })

  it('creates a service-by-complexity monthly accuracy view from final prices', () => {
    const sql = read('supabase/migrations/20260807091000_kael_estimate_accuracy.sql')
    const hardening = read('supabase/migrations/20260808131000_harden_kael_estimate_accuracy_view.sql')
    expect(sql).toContain('create or replace view public.kael_estimate_accuracy')
    expect(sql).toContain("percentile_cont(0.5)")
    expect(sql).toContain("percentile_cont(0.9)")
    expect(sql).toContain('j.completed_at is not null')
    expect(sql).toContain("j.status in ('completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed')")
    expect(sql).not.toContain('coalesce(j.completed_at, j.confirmed_at, j.paid_at, j.updated_at)')
    expect(sql).toContain('j.final_price')
    expect(sql).toContain('j.kael_price_min')
    expect(sql).toContain('j.kael_price_max')
    expect(sql).toContain('grant select on public.kael_estimate_accuracy to service_role')
    expect(hardening).toContain('alter view public.kael_estimate_accuracy')
    expect(hardening).toContain('security_invoker = true')
    expect(hardening).toContain('revoke all on public.kael_estimate_accuracy from authenticated')
    expect(hardening).toContain('grant select on public.kael_estimate_accuracy to service_role')
  })

  it('adds durable queue resolution metadata and a 90-day api_logs cleanup cron', () => {
    const queue = read('supabase/migrations/20260807092000_kael_admin_queue_resolution.sql')
    const retention = read('supabase/migrations/20260807093000_api_logs_retention.sql')
    expect(queue).toContain('resolved_by uuid references public.profiles(id)')
    expect(queue).toContain('resolution_note text')
    expect(retention).toContain("'api-logs-cleanup'")
    expect(retention).toContain("interval '90 days'")
  })

  it('ships executable SQL verification files for every new migration', () => {
    for (const file of [
      'api_logs_retention_verification.sql',
      'kael_admin_queue_resolution_verification.sql',
      'kael_estimate_accuracy_verification.sql',
      'kael_structured_feedback_verification.sql',
    ]) {
      const sql = read(`supabase/tests/${file}`)
      expect(sql).toContain('begin;')
      expect(sql).toContain('rollback;')
      expect(sql).toContain('raise exception')
    }
  })
})
