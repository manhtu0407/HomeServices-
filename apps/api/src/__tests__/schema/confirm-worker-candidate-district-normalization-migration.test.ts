import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/20260722060000_fix_confirm_worker_candidate_district_normalization.sql',
)
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('confirm-worker-candidate district normalization migration', () => {
  it('uses the same canonical district contract as broadcast acceptance', () => {
    expect(sql).toContain('create or replace function public.confirm_worker_candidate_atomic')
    expect(sql).toContain('v_job_district := public.normalize_hcmc_district_code(v_job.address_district)')
    expect(sql).toContain('v_job_district = any(v_worker.districts)')
    expect(sql).not.toContain('v_job.address_district = any(v_worker.districts)')
  })

  it('keeps the customer decision RPC service-role-only', () => {
    const signature = 'confirm_worker_candidate_atomic(uuid, uuid, uuid)'
    expect(sql).toContain(`revoke execute on function public.${signature} from public`)
    expect(sql).toContain(`revoke execute on function public.${signature} from anon`)
    expect(sql).toContain(`revoke execute on function public.${signature} from authenticated`)
    expect(sql).toContain(`grant execute on function public.${signature} to service_role`)
  })
})
