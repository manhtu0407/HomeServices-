import { describe, it, expect } from 'vitest'
import { normalizeDistrict, normalizeServiceAreaDistrict, HCMC_DISTRICTS, DEFAULT_DISTRICT } from '../constants'

describe('normalizeDistrict', () => {
  describe('exact slug match', () => {
    it.each(Object.keys(HCMC_DISTRICTS))('passes through canonical slug: %s', (slug) => {
      expect(normalizeDistrict(slug)).toBe(slug)
    })
  })

  describe('case-insensitive slug', () => {
    it('uppercase Q1 → q1', () => {
      expect(normalizeDistrict('Q1')).toBe('q1')
    })

    it('mixed case BINH_THANH → binh_thanh', () => {
      expect(normalizeDistrict('BINH_THANH')).toBe('binh_thanh')
    })

    it('uppercase HCMC_ALL → hcmc_all', () => {
      expect(normalizeDistrict('HCMC_ALL')).toBe('hcmc_all')
    })
  })

  describe('Vietnamese label match', () => {
    it('"Quận 1" → q1', () => {
      expect(normalizeDistrict('Quận 1')).toBe('q1')
    })

    it('"quận 1" (lowercase) → q1', () => {
      expect(normalizeDistrict('quận 1')).toBe('q1')
    })

    it('"Bình Thạnh" → binh_thanh', () => {
      expect(normalizeDistrict('Bình Thạnh')).toBe('binh_thanh')
    })

    it('"Thủ Đức" → thu_duc', () => {
      expect(normalizeDistrict('Thủ Đức')).toBe('thu_duc')
    })

    it('"Gò Vấp" → go_vap', () => {
      expect(normalizeDistrict('Gò Vấp')).toBe('go_vap')
    })
  })

  describe('numbered district pattern', () => {
    it('"Q.1" → q1', () => {
      expect(normalizeDistrict('Q.1')).toBe('q1')
    })

    it('"Q. 1" with space → q1', () => {
      expect(normalizeDistrict('Q. 1')).toBe('q1')
    })

    it('"quan 1" (no diacritics) → q1', () => {
      expect(normalizeDistrict('quan 1')).toBe('q1')
    })

    it('"Q12" → q12', () => {
      expect(normalizeDistrict('Q12')).toBe('q12')
    })

    it('"Quận 12" → q12', () => {
      expect(normalizeDistrict('Quận 12')).toBe('q12')
    })
  })

  describe('fallback behavior (RULES.md #8 — no fake data)', () => {
    it('null → hcmc_all', () => {
      expect(normalizeDistrict(null)).toBe(DEFAULT_DISTRICT)
    })

    it('undefined → hcmc_all', () => {
      expect(normalizeDistrict(undefined)).toBe(DEFAULT_DISTRICT)
    })

    it('empty string → hcmc_all', () => {
      expect(normalizeDistrict('')).toBe(DEFAULT_DISTRICT)
    })

    it('whitespace-only → hcmc_all', () => {
      expect(normalizeDistrict('   ')).toBe(DEFAULT_DISTRICT)
    })

    it('unknown district "Quận 999" → hcmc_all (no silent fake match)', () => {
      expect(normalizeDistrict('Quận 999')).toBe(DEFAULT_DISTRICT)
    })

    it('non-HCMC district "Hà Nội" → hcmc_all', () => {
      expect(normalizeDistrict('Hà Nội')).toBe(DEFAULT_DISTRICT)
    })
  })

  describe('idempotency', () => {
    it('normalizing canonical slug twice = same slug', () => {
      expect(normalizeDistrict(normalizeDistrict('q1'))).toBe('q1')
    })

    it('normalizing label twice = canonical slug', () => {
      const once = normalizeDistrict('Quận 1')
      expect(normalizeDistrict(once)).toBe(once)
    })
  })
})

describe('HCMC_DISTRICTS catalog', () => {
  it('contains hcmc_all fallback', () => {
    expect(HCMC_DISTRICTS).toHaveProperty('hcmc_all')
  })

  it('every slug is snake_case lowercase', () => {
    for (const slug of Object.keys(HCMC_DISTRICTS)) {
      expect(slug).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it('every label is non-empty', () => {
    for (const label of Object.values(HCMC_DISTRICTS)) {
      expect(label.length).toBeGreaterThan(0)
    }
  })

  it('is frozen (cannot mutate at runtime)', () => {
    expect(Object.isFrozen(HCMC_DISTRICTS)).toBe(true)
  })
})

describe('normalizeServiceAreaDistrict', () => {
  it('accepts a concrete HCMC district for customer dispatch', () => {
    expect(normalizeServiceAreaDistrict('Quận 7')).toBe('q7')
  })

  it('rejects unknown and city-wide values for new customer jobs', () => {
    expect(normalizeServiceAreaDistrict('Hà Nội')).toBeNull()
    expect(normalizeServiceAreaDistrict('hcmc_all')).toBeNull()
    expect(normalizeServiceAreaDistrict('')).toBeNull()
  })
})
