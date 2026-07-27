import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/20260726120000_restore_accept_broadcast_district_normalization.sql',
)
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('accept-broadcast district normalization regression', () => {
  it('normalizes customer-facing district labels in the current acceptance RPC', () => {
    expect(sql).toContain('create or replace function public.accept_broadcast_atomic')
    expect(sql).toContain(
      'v_job_district := public.normalize_hcmc_district_code(v_job.address_district)',
    )
    expect(sql).toContain("v_job_district = 'hcmc_all'")
    expect(sql).toContain('v_job_district = any(v_worker.districts)')
    expect(sql).not.toContain('v_job_district := v_job.address_district')
  })

  it('preserves the selected-service, quality, privacy, and service-role guards', () => {
    expect(sql).toContain('v_worker.selected_service_types')
    expect(sql).toContain('public.worker_service_quality_status')
    expect(sql).toContain('security invoker')
    expect(sql).toContain('set search_path = public, pg_catalog')
    expect(sql).toContain('and jb.worker_id = p_worker_id')

    const signature = 'accept_broadcast_atomic(uuid, uuid)'
    expect(sql).toContain(`revoke execute on function public.${signature} from public`)
    expect(sql).toContain(`revoke execute on function public.${signature} from anon`)
    expect(sql).toContain(`revoke execute on function public.${signature} from authenticated`)
    expect(sql).toContain(`grant execute on function public.${signature} to service_role`)
  })
})
