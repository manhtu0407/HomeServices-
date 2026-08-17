import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../../../../supabase/migrations/20260813123719_seed_verified_hinge_replacement_price.sql',
  import.meta.url,
)

describe('verified cabinet-hinge replacement baseline', () => {
  const sql = readFileSync(migrationUrl, 'utf8')

  it('adds a distinct active handyman problem instead of reusing the adjustment baseline', () => {
    expect(sql).toContain("'replace_cabinet_hinges'")
    expect(sql).toContain("'handyman'::public.service_type")
    expect(sql).toContain("'Thay hai bản lề tủ'")
  })

  it('stores the source-backed two-piece total and its provenance', () => {
    expect(sql).toMatch(/240000\s*,\s*360000/)
    expect(sql).toContain('daiphong_cabinet_hinge_replacement_per_piece_x2_2026_08')
    expect(sql).toContain('https://suachuatainha.com.vn/bao-gia-sua-chua-moc/')
    expect(sql).toContain('2 x (120,000-180,000 VND)')
  })
})
