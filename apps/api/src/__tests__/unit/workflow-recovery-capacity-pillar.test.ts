import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P70-workflow-recovery-capacity',
  invariant:
    'Stuck real-user workflows create auditable recovery cases without automatic job transitions, while expired or obsolete matching capacity is released without freeing an active official job',
  authority: [
    'approved Production Agentic Transaction Readiness plan (stuck workflow recovery)',
    'governance/RULES.md #8 (honest state and no fake completion)',
  ],
  target: 'supabase/migrations/20260904233000_workflow_recovery_capacity_reconciliation.sql',
  layer: 'security-negative',
  siblings: ['P67-public-coverage-reservation', 'P68-completion-payment-authority'],
  mutation:
    'auto-update a stuck job, expose recovery tables to authenticated clients, or leave an obsolete capacity lease active; this pillar turns red',
} as const satisfies PillarManifest

const root = resolve(__dirname, '../../../../../')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260904233000_workflow_recovery_capacity_reconciliation.sql',
)
const adminRecoverySurfacePath = resolve(
  root,
  'apps/mobile/components/admin/admin-workflow-recovery-center.tsx',
)

function functionBody(source: string, functionName: string) {
  const start = source.indexOf(`create or replace function ${functionName}`)
  expect(start, pillarWhy(PILLAR, `${functionName} must exist`)).toBeGreaterThanOrEqual(0)
  const end = source.indexOf('\n$func$;', start)
  expect(end, pillarWhy(PILLAR, `${functionName} must have a bounded body`)).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('workflow recovery and matching capacity reconciliation', () => {
  it('ships isolated recovery cases and append-only action receipts', () => {
    expect(existsSync(migrationPath), pillarWhy(PILLAR, 'recovery migration must ship')).toBe(true)
    const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')

    expect(migration).toContain('public.workflow_recovery_cases')
    expect(migration).toContain('public.workflow_recovery_action_audit')
    expect(migration).toContain('workflow_recovery_cases_one_active_job_idx')
    expect(migration).toContain("job.synthetic_cohort_id is null")
    expect(migration).not.toMatch(/\b(drop|truncate|delete\s+from)\b/iu)
  })

  it('never changes a job while detecting or administering recovery', () => {
    const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')
    const detector = functionBody(migration, 'public.detect_workflow_recovery_cases')
    const adminAction = functionBody(migration, 'public.admin_apply_workflow_recovery_action_atomic')

    expect(detector).not.toMatch(/update\s+public\.jobs/iu)
    expect(adminAction).not.toMatch(/update\s+public\.jobs/iu)
    expect(adminAction).toContain("'CASE_STILL_STUCK'")
    expect(adminAction).toContain("'operations.triage' = any(operator_account.capabilities)")
  })

  it('releases only expired or job-obsolete capacity through service-role contracts', () => {
    const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')
    const reconcile = functionBody(migration, 'public.reconcile_matching_capacity_reservations')

    expect(reconcile).toContain("capacity.expires_at <= p_observed_at")
    expect(reconcile).toContain("job.status not in (")
    expect(reconcile).toContain("'broadcasting'::public.job_status")
    expect(reconcile).toContain("'worker_candidate_pending'::public.job_status")
    expect(migration).toMatch(/grant execute on function public\.reconcile_matching_capacity_reservations\([\s\S]*?\)\s+to service_role/iu)
    expect(migration).toMatch(/revoke execute on function public\.reconcile_matching_capacity_reservations\([\s\S]*?\)\s+from public, anon, authenticated/iu)
  })

  it('localizes every closed recovery reason and keeps system recovery read-only', () => {
    const surface = readFileSync(adminRecoverySurfacePath, 'utf8')
    const reasons = [
      'MATCHING_RECOVERY_STUCK', 'BROADCASTING_STUCK', 'CANDIDATE_DECISION_STUCK',
      'WORKER_ON_WAY_STUCK', 'ARRIVAL_STUCK', 'INSPECTION_STUCK', 'WORK_STUCK',
      'SCOPE_CHANGE_STUCK', 'COMPLETION_CONFIRMATION_STUCK', 'PAYMENT_SETUP_STUCK',
      'PAYMENT_RECONCILIATION_STUCK',
    ]

    for (const reason of reasons) {
      expect(surface, pillarWhy(PILLAR, `${reason} must not leak as raw product copy`)).toMatch(
        new RegExp(`${reason}:[\\s\\S]*?vi|reasonCode:[\\s\\S]*?${reason}`, 'u'),
      )
    }
    expect(surface).toContain("system_recovered: 'Hệ thống ghi nhận đã phục hồi'")
    expect(surface).toContain('USER_ACTIONS.map')
    expect(surface).not.toContain('Object.keys(strings.action)')
    expect(surface).not.toContain('setError(result.error')
  })
})
