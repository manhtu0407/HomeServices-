import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/20260722053000_fix_accept_broadcast_district_normalization.sql',
)
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('accept-broadcast district normalization migration', () => {
  it('normalizes stored district labels before checking worker eligibility', () => {
    expect(sql).toContain('normalize_hcmc_district_code')
    expect(sql).toContain('v_job_district := public.normalize_hcmc_district_code(v_job.address_district)')
    expect(sql).toContain('v_job_district = any(v_worker.districts)')
  })

  it('covers canonical, accented, ASCII, and legacy Thu Duc district values', () => {
    expect(sql).toContain("'thu_duc'")
    expect(sql).toContain("'thu duc'")
    expect(sql).toContain('v_num = 2 or v_num = 9')
  })

  it('keeps both normalization and acceptance RPCs service-role-only', () => {
    for (const signature of [
      'normalize_hcmc_district_code(text)',
      'accept_broadcast_atomic(uuid, uuid)',
    ]) {
      expect(sql).toContain(`revoke execute on function public.${signature} from public`)
      expect(sql).toContain(`revoke execute on function public.${signature} from anon`)
      expect(sql).toContain(`revoke execute on function public.${signature} from authenticated`)
      expect(sql).toContain(`grant execute on function public.${signature} to service_role`)
    }
  })
})
