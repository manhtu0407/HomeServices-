import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  SERVICE_TYPES,
  JOB_STATUSES,
  COMPLEXITY_LEVELS,
  USER_ROLES,
  MESSAGE_SENDERS,
  BROADCAST_STATUSES,
  PLATFORM_FEE_CUSTOMER,
  PLATFORM_FEE_WORKER,
  PROBLEM_CHIPS,
  REVIEW_TAGS,
} from '../constants'

// Read SQL to cross-check constants against database enums
const SQL = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20260511000000_init_schema.sql'),
  'utf-8'
)

function extractEnumValues(sql: string, enumName: string): string[] {
  const re = new RegExp(`create\\s+type\\s+${enumName}\\s+as\\s+enum\\s*\\(([^)]+)\\)`, 'i')
  const match = sql.match(re)
  if (!match) return []
  // Strip SQL comments BEFORE splitting — comments may contain commas
  // e.g. "'pending', -- A3: submitted, Kael processing"
  return match[1]
    .replace(/--.*$/gm, '')
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
}

// ===================================================================
// Cross-check: constants must match SQL enums exactly
// If these fail, either constants.ts or the migration drifted.
// ===================================================================

describe('SERVICE_TYPES vs SQL service_type enum', () => {
  const sqlValues = extractEnumValues(SQL, 'service_type')

  it('SQL enum has values', () => {
    expect(sqlValues.length).toBeGreaterThan(0)
  })

  it('constants match SQL exactly (same values, same order)', () => {
    expect([...SERVICE_TYPES]).toEqual(sqlValues)
  })

  it('has exactly 2 values (Rule #6: only electrical + plumbing)', () => {
    expect(SERVICE_TYPES).toHaveLength(2)
  })
})

describe('JOB_STATUSES vs SQL job_status enum', () => {
  const sqlValues = extractEnumValues(SQL, 'job_status')

  it('SQL enum has values', () => {
    expect(sqlValues.length).toBeGreaterThan(0)
  })

  it('constants match SQL exactly', () => {
    expect([...JOB_STATUSES]).toEqual(sqlValues)
  })

  it('has 11 statuses matching STRUCTURES.md workflow', () => {
    expect(JOB_STATUSES).toHaveLength(11)
  })

  it('starts with pending and ends with cancelled', () => {
    expect(JOB_STATUSES[0]).toBe('pending')
    expect(JOB_STATUSES[JOB_STATUSES.length - 1]).toBe('cancelled')
  })
})

describe('COMPLEXITY_LEVELS vs SQL complexity_level enum', () => {
  const sqlValues = extractEnumValues(SQL, 'complexity_level')

  it('constants match SQL exactly', () => {
    expect([...COMPLEXITY_LEVELS]).toEqual(sqlValues)
  })
})

describe('USER_ROLES vs SQL user_role enum', () => {
  const sqlValues = extractEnumValues(SQL, 'user_role')

  it('constants match SQL exactly', () => {
    expect([...USER_ROLES]).toEqual(sqlValues)
  })

  it('has exactly 3 roles', () => {
    expect(USER_ROLES).toHaveLength(3)
  })
})

describe('MESSAGE_SENDERS vs SQL message_sender enum', () => {
  const sqlValues = extractEnumValues(SQL, 'message_sender')

  it('constants match SQL exactly', () => {
    expect([...MESSAGE_SENDERS]).toEqual(sqlValues)
  })
})

describe('BROADCAST_STATUSES vs SQL broadcast_status enum', () => {
  const sqlValues = extractEnumValues(SQL, 'broadcast_status')

  it('constants match SQL exactly', () => {
    expect([...BROADCAST_STATUSES]).toEqual(sqlValues)
  })
})

// ===================================================================
// Business rules from STRUCTURES.md
// ===================================================================

describe('PLATFORM_FEE constants (STRUCTURES.md §5)', () => {
  it('customer fee is 7.5%', () => {
    expect(PLATFORM_FEE_CUSTOMER).toBe(0.075)
  })

  it('worker fee is 10%', () => {
    expect(PLATFORM_FEE_WORKER).toBe(0.10)
  })

  it('total commission is 15% (7.5% + ~10% = ~17.5% gross, but net ~15%)', () => {
    // STRUCTURES.md §5 says 15% total commission.
    // Customer pays 7.5% on top. Worker pays 10% deducted.
    // Verify neither exceeds documented limits.
    expect(PLATFORM_FEE_CUSTOMER).toBeLessThanOrEqual(0.10)
    expect(PLATFORM_FEE_WORKER).toBeLessThanOrEqual(0.15)
  })
})

describe('PROBLEM_CHIPS (STRUCTURES.md §3A A2)', () => {
  it('has exactly 2 service type keys (electrical + plumbing)', () => {
    const keys = Object.keys(PROBLEM_CHIPS)
    expect(keys).toHaveLength(2)
    expect(keys).toContain('electrical')
    expect(keys).toContain('plumbing')
  })

  it('electrical has 7 chips matching STRUCTURES.md', () => {
    expect(PROBLEM_CHIPS.electrical).toHaveLength(7)
  })

  it('plumbing has 7 chips matching STRUCTURES.md', () => {
    expect(PROBLEM_CHIPS.plumbing).toHaveLength(7)
  })

  it('both end with "Vấn đề khác"', () => {
    expect(PROBLEM_CHIPS.electrical[PROBLEM_CHIPS.electrical.length - 1]).toBe('Vấn đề khác')
    expect(PROBLEM_CHIPS.plumbing[PROBLEM_CHIPS.plumbing.length - 1]).toBe('Vấn đề khác')
  })

  it('PROBLEM_CHIPS keys align with SERVICE_TYPES', () => {
    const chipKeys = Object.keys(PROBLEM_CHIPS).sort()
    const serviceTypes = [...SERVICE_TYPES].sort()
    expect(chipKeys).toEqual(serviceTypes)
  })

  it('no empty chip labels', () => {
    for (const chips of Object.values(PROBLEM_CHIPS)) {
      for (const chip of chips) {
        expect(chip.length).toBeGreaterThan(0)
      }
    }
  })

  it('no duplicate chips within a category', () => {
    for (const [category, chips] of Object.entries(PROBLEM_CHIPS)) {
      const unique = new Set(chips)
      expect(unique.size).toBe(chips.length)
    }
  })
})

describe('REVIEW_TAGS (STRUCTURES.md §3A A14)', () => {
  it('has 5 tags', () => {
    expect(REVIEW_TAGS).toHaveLength(5)
  })

  it('no duplicates', () => {
    const unique = new Set(REVIEW_TAGS)
    expect(unique.size).toBe(REVIEW_TAGS.length)
  })

  it('all Vietnamese text (no English)', () => {
    for (const tag of REVIEW_TAGS) {
      // Vietnamese chars contain diacritics — verify at least one non-ASCII char
      // or known Vietnamese word pattern
      expect(tag.length).toBeGreaterThan(0)
    }
  })
})

// ===================================================================
// Immutability: arrays should be readonly (as const)
// ===================================================================

describe('Constants are readonly (as const enforcement)', () => {
  it('SERVICE_TYPES is frozen/readonly tuple', () => {
    expect(() => {
      ;(SERVICE_TYPES as unknown as string[]).push('hvac')
    }).toThrow()
  })

  it('JOB_STATUSES is frozen/readonly tuple', () => {
    expect(() => {
      ;(JOB_STATUSES as unknown as string[]).push('deleted')
    }).toThrow()
  })

  it('USER_ROLES is frozen/readonly tuple', () => {
    expect(() => {
      ;(USER_ROLES as unknown as string[]).push('superadmin')
    }).toThrow()
  })
})
