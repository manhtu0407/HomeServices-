import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../../')
const sql = readFileSync(
  resolve(root, 'supabase/migrations/20260711062000_unified_scope_change_timing.sql'),
  'utf8',
)
const service = readFileSync(
  resolve(root, 'supabase/functions/mobile-api/_shared/services/scope-change.service.ts'),
  'utf8',
)
const orchestrator = readFileSync(
  resolve(root, 'supabase/functions/mobile-api/_shared/workflow-orchestrator.ts'),
  'utf8',
)
const notifications = readFileSync(
  resolve(root, 'supabase/functions/mobile-api/_shared/services/notifications.service.ts'),
  'utf8',
)
const scopeMediaSql = readFileSync(
  resolve(root, 'supabase/migrations/20260711064000_scope_change_private_media_refs.sql'),
  'utf8',
)

describe('unified pre-arrival and on-site scope adjustment', () => {
  it('captures timing and the exact status that can safely resume', () => {
    expect(sql).toContain('request_timing text not null')
    expect(sql).toContain('resume_job_status public.job_status not null')
    expect(sql).toContain("then 'pre_arrival'")
    expect(sql).toContain('v_job.status')
  })

  it('allows the same hard gate before arrival and on site', () => {
    for (const status of ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing']) {
      expect(sql).toContain(`'${status}'::public.job_status`)
      expect(orchestrator).toContain(`["${status}", "scope_change_pending"]`)
    }
  })

  it('keeps original work alive when the customer rejects the adjustment', () => {
    expect(sql).toContain('v_job_status := v_sc.resume_job_status')
    expect(sql).not.toMatch(/p_decision = 'reject'[\s\S]{0,500}'cancelled'::public\.job_status/)
    expect(sql).not.toContain('cancelled_at = case')
  })

  it('uses explicit customer confirmation without an autonomy feature flag', () => {
    expect(service).not.toContain('runPolicyAutonomyGate')
    expect(service).not.toContain('tryAutoApproveScopeChange')
    expect(service).not.toContain('autoDecision')
    expect(service).toContain('customer_confirmed_scope_change')
    expect(service).toContain('customer_rejected_scope_change')
    expect(service).toContain('customer_confirmation: true')
  })

  it('uses customer-authored notifications and never claims rejection cancelled the job', () => {
    const customerRequest = notifications.match(
      /export async function notifyCustomerScopeChangeRequested[\s\S]*?^}/m,
    )?.[0] ?? ''
    const workerDecision = notifications.match(
      /export async function notifyWorkerScopeDecision[\s\S]*?^}/m,
    )?.[0] ?? ''

    expect(customerRequest).toContain('actor: "worker"')
    expect(customerRequest).toContain('customer_confirmation_required: true')
    expect(customerRequest).toContain('tạm dừng đến khi bạn xác nhận hoặc giữ phạm vi cũ')
    expect(workerDecision).toContain('actor: "customer"')
    expect(notifications).not.toContain('kael_system')
    expect(notifications).not.toMatch(/công việc đã được hủy|hủy phần phát sinh theo chính sách/i)
    expect(workerDecision).toContain('Công việc tiếp tục theo phạm vi đã chốt trước đó')
  })

  it('accepts only attached private job-media evidence for the current participants', () => {
    expect(scopeMediaSql).toContain('validate_scope_change_evidence_refs')
    expect(scopeMediaSql).toContain('join storage.objects as object')
    expect(scopeMediaSql).toContain("asset.stage = 'scope_change_evidence' and asset.owner_id = p_worker_id")
    expect(scopeMediaSql).toContain("asset.stage = 'before' and asset.owner_id = v_customer_id")
    expect(scopeMediaSql).toContain('INVALID_SCOPE_MEDIA_REF')
    expect(scopeMediaSql).toMatch(/revoke all on function public\.validate_scope_change_evidence_refs[\s\S]+authenticated/)
    expect(scopeMediaSql).toMatch(/grant execute on function public\.validate_scope_change_evidence_refs[\s\S]+service_role/)
    expect(service).toContain('validateScopeChangeEvidenceRefs')
    expect(service).toContain('p_evidence_photo_urls: evidencePhotoRefs')
  })
})
