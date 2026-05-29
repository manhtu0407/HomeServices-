import { describe, expect, it } from 'vitest'
import {
  extractDistrictFromAddressLabel,
  normalizeDistrict,
  workerRegisterSchema,
} from '@home-services/shared'

// X3 (Plan.md §27.6 — 2026-05-29): Matching layer unblock fixes.
// - F-08 normalizeDistrict should match ASCII labels via diacritic strip
// - F-14 extractDistrictFromAddressLabel parses comma-separated address
// - F-09/F-31 workerRegisterSchema rejects districts that don't normalize

describe('X3 normalizeDistrict — F-08 diacritic-stripped label match', () => {
  it.each([
    ['Binh Thanh', 'binh_thanh'],
    ['binh thanh', 'binh_thanh'],
    ['BINH THANH', 'binh_thanh'],
    ['Bình Thạnh', 'binh_thanh'],
    ['Thu Duc', 'thu_duc'],
    ['THỦ ĐỨC', 'thu_duc'],
    ['Phu Nhuan', 'phu_nhuan'],
    ['Go Vap', 'go_vap'],
    ['Hoc Mon', 'hoc_mon'],
  ])('normalizes "%s" -> "%s"', (input, expected) => {
    expect(normalizeDistrict(input)).toBe(expected)
  })

  it.each([
    ['Quan 1', 'q1'],
    ['quan 1', 'q1'],
    ['Q1', 'q1'],
    ['Q.1', 'q1'],
    ['Quận 1', 'q1'],
    ['Quận 7', 'q7'],
    ['Quan 2', 'thu_duc'],
    ['Quan 9', 'thu_duc'],
  ])('normalizes numbered "%s" -> "%s"', (input, expected) => {
    expect(normalizeDistrict(input)).toBe(expected)
  })

  it('returns hcmc_all for unknown / non-HCMC inputs', () => {
    expect(normalizeDistrict('Hà Nội')).toBe('hcmc_all')
    expect(normalizeDistrict('Đà Nẵng')).toBe('hcmc_all')
    expect(normalizeDistrict('')).toBe('hcmc_all')
    expect(normalizeDistrict('   ')).toBe('hcmc_all')
  })
})

describe('X3 extractDistrictFromAddressLabel — F-14 substring parse', () => {
  it.each([
    ['Vinhomes Central Park, Bình Thạnh', 'binh_thanh'],
    ['Saigon Pearl Tower, Bình Thạnh, TP. HCM', 'binh_thanh'],
    ['Vinhomes Central Park / Binh Thanh', 'binh_thanh'],
    ['The Manor — Quan 1', 'q1'],
    ['City Garden Apartment, Quận 1', 'q1'],
    ['Masteri Thảo Điền · Thu Duc', 'thu_duc'],
    ['Estella Heights, Quan 2', 'thu_duc'],
    ['Sunwah Pearl; Quận 7', 'q7'],
    ['binh_thanh', 'binh_thanh'],
    ['q7', 'q7'],
  ])('extracts "%s" -> "%s"', (input, expected) => {
    expect(extractDistrictFromAddressLabel(input)).toBe(expected)
  })

  it('returns hcmc_all when no district piece matches', () => {
    expect(extractDistrictFromAddressLabel('Random Building Hà Nội Tower')).toBe(
      'hcmc_all',
    )
    expect(extractDistrictFromAddressLabel(null)).toBe('hcmc_all')
    expect(extractDistrictFromAddressLabel(undefined)).toBe('hcmc_all')
  })
})

describe('X3 workerRegisterSchema — F-09/F-31 reject non-slug districts', () => {
  const base = {
    legal_name: 'Nguyễn Văn A',
    date_of_birth: '1990-01-01',
    service_types: ['electrical'],
    years_experience: 5,
    cccd_front_url: 'https://example.com/cccd_front.jpg',
    cccd_back_url: 'https://example.com/cccd_back.jpg',
    selfie_url: 'https://example.com/selfie.jpg',
    bank_account: '1234567890',
    bank_name: 'Vietcombank',
  }

  it('accepts canonical slug districts', () => {
    const result = workerRegisterSchema.safeParse({
      ...base,
      districts: ['binh_thanh', 'q1', 'thu_duc'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts Vietnamese label form (canonicalisation happens in service)', () => {
    const result = workerRegisterSchema.safeParse({
      ...base,
      districts: ['Bình Thạnh', 'Quận 1'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts ASCII label form via F-08 diacritic strip', () => {
    const result = workerRegisterSchema.safeParse({
      ...base,
      districts: ['Binh Thanh', 'Quan 1', 'Quan 2'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown / non-HCMC districts', () => {
    const result = workerRegisterSchema.safeParse({
      ...base,
      districts: ['Hà Nội'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects mixed valid + invalid districts', () => {
    const result = workerRegisterSchema.safeParse({
      ...base,
      districts: ['binh_thanh', 'random text'],
    })
    expect(result.success).toBe(false)
  })
})
