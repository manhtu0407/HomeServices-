import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260813120000_seed_verified_hinge_repair_price.sql',
  ),
  'utf8',
)

describe('verified handyman hinge repair price', () => {
  it('seeds a source-backed small-job range for one sagging cabinet door', () => {
    expect(sql).toContain("'repair_hinge_or_handle'")
    expect(sql).toContain("'handyman'::public.service_type")
    expect(sql).toContain("'small'::public.complexity_level")
    expect(sql).toMatch(/150000\s*,\s*350000/)
    expect(sql).toContain('https://suachuatainha.com.vn/thay-sua-ray-truot-ban-le-phu-kien-tu-go/')
    expect(sql).toContain('https://suachuatainha.com.vn/bao-gia-sua-chua-moc/')
  })

  it('uses the existing idempotent conflict key without changing the schema', () => {
    expect(sql).toMatch(/on conflict \(service_problem_id, district_code, complexity\) do update/i)
    expect(sql).not.toMatch(/create\s+table|alter\s+table/i)
  })
})
