import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20260711060000_six_service_taxonomy_verified_prices.sql',
  ),
  'utf8',
)

describe('six-service taxonomy and verified price sources', () => {
  it('registers all three new service categories and every runtime problem slug', () => {
    for (const service of ['hvac', 'upholstery', 'handyman']) {
      expect(sql).toContain(`'${service}'::public.service_type`)
    }

    for (const slug of [
      'error_code',
      'hvac-general',
      'no_cooling',
      'other_hvac',
      'routine_hvac_cleaning',
      'unusual_noise',
      'water_leak',
      'weak_cooling',
      'carpet_cleaning',
      'curtain_cleaning',
      'mattress_cleaning',
      'odor_or_mold',
      'other_upholstery',
      'sofa_cleaning',
      'stain_treatment',
      'upholstery-general',
      'drill_or_mount_shelf',
      'handyman-general',
      'install_bathroom_fixture',
      'install_curtain_rod',
      'install_small_fixture',
      'mount_tv_or_furniture',
      'other_handyman',
      'repair_hinge_or_handle',
    ]) {
      expect(sql).toContain(`'${slug}'`)
    }
  })

  it('seeds only exact source-backed item and unit prices without complexity extrapolation', () => {
    const priceRows = sql.match(
      /\('[^']+', '(small|medium|large)', \d+, \d+, '[^']+'\)/g,
    )

    expect(priceRows).toEqual([
      "('routine_hvac_cleaning', 'small', 200000, 200000, 'dienmayxanh_wall_ac_cleaning_per_unit_2026_07')",
      "('sofa_cleaning', 'small', 250000, 450000, 'huy_hoang_sofa_item_size_band_2026_07')",
      "('mattress_cleaning', 'small', 270000, 400000, 'huy_hoang_mattress_item_size_band_2026_07')",
      "('carpet_cleaning', 'small', 290000, 450000, 'huy_hoang_decorative_carpet_item_size_band_2026_07')",
      "('drill_or_mount_shelf', 'small', 150000, 300000, 'onefix_drill_or_mount_shelf_per_item_2026_07')",
    ])
    expect(sql).not.toContain('verified_hcmc_market_2026_07')
    expect(sql).toContain('https://www.dienmayxanh.com/ve-sinh-may-lanh')
    expect(sql).toContain('https://giatsofahuyhoang.com/')
    expect(sql).toContain('https://1fix.vn/dich-vu-khoan-tuong-tai-nha-tphcm')
  })

  it('leaves work without a matching item or unit baseline unpriced', () => {
    for (const unpricedSlug of [
      'no_cooling',
      'weak_cooling',
      'water_leak',
      'unusual_noise',
      'error_code',
      'odor_or_mold',
      'stain_treatment',
      'curtain_cleaning',
      'install_curtain_rod',
      'mount_tv_or_furniture',
      'install_small_fixture',
      'install_bathroom_fixture',
      'other_handyman',
    ]) {
      expect(sql).toContain(`-- intentionally unpriced: ${unpricedSlug}`)
    }
  })

  it('keeps every seeded range positive and ordered through the existing conflict key', () => {
    expect(sql).toMatch(/check \(price_max >= price_min and price_min > 0\)/i)
    expect(sql).toMatch(/on conflict \(service_problem_id, district_code, complexity\) do update/i)
    expect(sql).not.toContain("'admin_seed'")
  })
})
