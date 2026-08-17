import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/20260813160000_confirm_candidate_service_preference_parity.sql',
)
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('confirm-worker-candidate service-preference parity migration', () => {
  it('rechecks the same selected service and quality lock used by worker acceptance', () => {
    expect(sql).toContain('create or replace function public.confirm_worker_candidate_atomic')
    expect(sql).toContain('wp.selected_service_types')
    expect(sql).toContain('v_worker.selected_service_types is null')
    expect(sql).toContain('v_job.service_type = any(v_worker.selected_service_types)')
    expect(sql).toContain('public.worker_service_quality_status')
    expect(sql).not.toContain('v_worker.service_types is null')
  })

  it('preserves district normalization and service-role-only execution', () => {
    const signature = 'confirm_worker_candidate_atomic(uuid, uuid, uuid)'
    expect(sql).toContain('public.normalize_hcmc_district_code(v_job.address_district)')
    expect(sql).toContain(`revoke execute on function public.${signature} from authenticated`)
    expect(sql).toContain(`grant execute on function public.${signature} to service_role`)
  })
})
