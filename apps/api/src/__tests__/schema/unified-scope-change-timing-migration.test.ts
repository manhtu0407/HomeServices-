import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../../')
const service = [
  'job/scope-change/request.ts',
  'job/scope-change/support.ts',
  'job/scope-change/decision.ts',
  'job/scope-change/effects.ts',
  'job/scope-change/effects-incident.ts',
  'job/scope-change/effects-payloads.ts',
  'job/scope-change/effects-drain.ts',
].map((path) => readFileSync(
  resolve(root, 'supabase/functions/mobile-api/_shared/domains', path),
  'utf8',
)).join('\n')
const orchestrator = readFileSync(
  resolve(root, 'supabase/functions/mobile-api/_shared/workflow-orchestrator.ts'),
  'utf8',
)
const notifications = [
  'notifications.ts',
  'notifications-events.ts',
].map((path) => readFileSync(
  resolve(root, 'supabase/functions/mobile-api/_shared/domains/notification', path),
  'utf8',
)).join('\n')
describe('unified pre-arrival and on-site scope adjustment', () => {
  it('allows the same hard gate before arrival and on site', () => {
    for (const status of ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing']) {
      expect(orchestrator).toContain(`["${status}", "scope_change_pending"]`)
    }
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
    expect(service).toContain('validateScopeChangeEvidenceRefs')
    expect(service).toContain('p_evidence_photo_urls: evidencePhotoRefs')
  })
})
