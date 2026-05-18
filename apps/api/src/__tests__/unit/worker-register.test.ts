import { describe, it, expect, vi } from 'vitest'
import { workerRegisterSchema } from '@home-services/shared'

vi.mock('@/lib/env', () => ({
  env: {
    supabaseUrl: 'http://localhost:54321',
    supabasePublishableKey: 'test-anon-key',
    supabaseServiceRoleKey: 'test-service-key',
  },
  ensureServerEnv: vi.fn(),
}))

vi.mock('@/lib/db/query', () => ({
  withDbTimeout: <T,>(p: PromiseLike<T>) => p,
  DbTimeoutError: class extends Error {},
}))

import { maskBankAccount, registerWorker } from '@/lib/workers/register'

// =============================================================================
// workerRegisterSchema validation
// =============================================================================

describe('workerRegisterSchema', () => {
  const VALID_INPUT = {
    legal_name: 'Nguyễn Văn A',
    date_of_birth: '1990-01-15',
    gender: 'male' as const,
    service_types: ['electrical' as const],
    years_experience: 5,
    districts: ['Quận 1', 'Quận 3'],
    cccd_front_url: 'https://storage.example.com/cccd-front.jpg',
    cccd_back_url: 'https://storage.example.com/cccd-back.jpg',
    selfie_url: 'https://storage.example.com/selfie.jpg',
    bank_account: '0123456789',
    bank_name: 'Vietcombank',
  }

  it('accepts valid input', () => {
    expect(workerRegisterSchema.safeParse(VALID_INPUT).success).toBe(true)
  })

  it('accepts both electrical and plumbing service types', () => {
    const result = workerRegisterSchema.safeParse({
      ...VALID_INPUT,
      service_types: ['electrical', 'plumbing'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts missing gender (optional)', () => {
    const { gender: _gender, ...withoutGender } = VALID_INPUT
    const result = workerRegisterSchema.safeParse(withoutGender)
    expect(result.success).toBe(true)
  })

  it('rejects empty service_types', () => {
    const result = workerRegisterSchema.safeParse({ ...VALID_INPUT, service_types: [] })
    expect(result.success).toBe(false)
  })

  it('rejects unsupported service (RULES.md #6)', () => {
    const result = workerRegisterSchema.safeParse({
      ...VALID_INPUT,
      service_types: ['cleaning'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects bad date_of_birth format', () => {
    const result = workerRegisterSchema.safeParse({
      ...VALID_INPUT,
      date_of_birth: '15-01-1990',
    })
    expect(result.success).toBe(false)
  })

  // EXT1: real calendar date validation
  it('rejects bogus month 99 (regex passes, but not real date)', () => {
    const result = workerRegisterSchema.safeParse({
      ...VALID_INPUT,
      date_of_birth: '1990-99-15',
    })
    expect(result.success).toBe(false)
  })

  it('rejects bogus day 99', () => {
    const result = workerRegisterSchema.safeParse({
      ...VALID_INPUT,
      date_of_birth: '1990-01-99',
    })
    expect(result.success).toBe(false)
  })

  it('rejects Feb 31 (silently rolls to March in JS Date)', () => {
    const result = workerRegisterSchema.safeParse({
      ...VALID_INPUT,
      date_of_birth: '1990-02-31',
    })
    expect(result.success).toBe(false)
  })

  it('rejects Apr 31 (April only has 30 days)', () => {
    const result = workerRegisterSchema.safeParse({
      ...VALID_INPUT,
      date_of_birth: '1990-04-31',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid leap year Feb 29 (2000)', () => {
    const result = workerRegisterSchema.safeParse({
      ...VALID_INPUT,
      date_of_birth: '2000-02-29',
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-leap year Feb 29 (2001)', () => {
    const result = workerRegisterSchema.safeParse({
      ...VALID_INPUT,
      date_of_birth: '2001-02-29',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty districts', () => {
    const result = workerRegisterSchema.safeParse({ ...VALID_INPUT, districts: [] })
    expect(result.success).toBe(false)
  })

  it('rejects non-URL cccd_front_url', () => {
    const result = workerRegisterSchema.safeParse({
      ...VALID_INPUT,
      cccd_front_url: 'not-a-url',
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative years_experience', () => {
    const result = workerRegisterSchema.safeParse({ ...VALID_INPUT, years_experience: -1 })
    expect(result.success).toBe(false)
  })

  it('rejects bank_account < 6 chars', () => {
    const result = workerRegisterSchema.safeParse({ ...VALID_INPUT, bank_account: '12345' })
    expect(result.success).toBe(false)
  })

  it('rejects short legal_name', () => {
    const result = workerRegisterSchema.safeParse({ ...VALID_INPUT, legal_name: 'A' })
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// maskBankAccount
// =============================================================================

describe('maskBankAccount', () => {
  it('masks normal account showing last 4', () => {
    expect(maskBankAccount('0123456789')).toBe('****6789')
  })

  it('masks 4-digit account', () => {
    expect(maskBankAccount('1234')).toBe('****1234')
  })

  it('returns null for null input', () => {
    expect(maskBankAccount(null)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(maskBankAccount('')).toBeNull()
  })

  it('returns null for input shorter than 4 chars', () => {
    expect(maskBankAccount('12')).toBeNull()
  })

  it('does NOT expose middle digits', () => {
    const masked = maskBankAccount('9999000011112222')
    expect(masked).toBe('****2222')
    expect(masked).not.toContain('9999')
    expect(masked).not.toContain('0000')
    expect(masked).not.toContain('1111')
  })
})

// =============================================================================
// registerWorker — business logic
// =============================================================================

function makeMockSupabase(opts: {
  profile?: { role: string } | null
  profileError?: { code: string } | null
  existingWorker?: { verification_status: string; is_suspended?: boolean } | null
  existingError?: { code: string } | null
  upsertResult?: { id: string; verification_status: string } | null
  upsertError?: { code: string } | null
}) {
  let callCount = 0
  return {
    from: vi.fn((_table: string) => {
      callCount++
      const isProfile = callCount === 1
      const isExisting = callCount === 2
      const isUpsert = callCount === 3

      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        single: vi.fn(async () => {
          if (isProfile) {
            return { data: opts.profile ?? null, error: opts.profileError ?? null }
          }
          if (isUpsert) {
            return { data: opts.upsertResult ?? null, error: opts.upsertError ?? null }
          }
          return { data: null, error: null }
        }),
        maybeSingle: vi.fn(async () => {
          if (isExisting) {
            return { data: opts.existingWorker ?? null, error: opts.existingError ?? null }
          }
          return { data: null, error: null }
        }),
      }
      return chain
    }),
  } as any
}

const VALID_INPUT = {
  legal_name: 'Nguyễn Văn A',
  date_of_birth: '1990-01-15',
  gender: 'male' as const,
  service_types: ['electrical' as const],
  years_experience: 5,
  districts: ['Quận 1'],
  cccd_front_url: 'https://x.com/a.jpg',
  cccd_back_url: 'https://x.com/b.jpg',
  selfie_url: 'https://x.com/c.jpg',
  bank_account: '0123456789',
  bank_name: 'Vietcombank',
}

describe('registerWorker', () => {
  it('succeeds when profile is worker and no existing worker_profile', async () => {
    const supabase = makeMockSupabase({
      profile: { role: 'worker' },
      existingWorker: null,
      upsertResult: { id: 'user-1', verification_status: 'submitted' },
    })

    const result = await registerWorker('user-1', VALID_INPUT, supabase)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.workerId).toBe('user-1')
      expect(result.verificationStatus).toBe('submitted')
    }
  })

  it('rejects when profile missing', async () => {
    const supabase = makeMockSupabase({
      profile: null,
      profileError: { code: 'PGRST116' },
    })

    const result = await registerWorker('user-x', VALID_INPUT, supabase)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
      expect(result.status).toBe(404)
    }
  })

  it('rejects when profile role is customer (not worker)', async () => {
    const supabase = makeMockSupabase({
      profile: { role: 'customer' },
    })

    const result = await registerWorker('user-1', VALID_INPUT, supabase)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('WRONG_ROLE')
      expect(result.status).toBe(403)
    }
  })

  it('rejects when worker is already approved (cannot re-register)', async () => {
    const supabase = makeMockSupabase({
      profile: { role: 'worker' },
      existingWorker: { verification_status: 'approved' },
    })

    const result = await registerWorker('user-1', VALID_INPUT, supabase)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ALREADY_FINALIZED')
      expect(result.status).toBe(409)
    }
  })

  it('rejects when worker is suspended', async () => {
    const supabase = makeMockSupabase({
      profile: { role: 'worker' },
      existingWorker: { verification_status: 'suspended' },
    })

    const result = await registerWorker('user-1', VALID_INPUT, supabase)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ALREADY_FINALIZED')
    }
  })

  it('rejects when worker has a suspended flag even before status is finalized', async () => {
    const supabase = makeMockSupabase({
      profile: { role: 'worker' },
      existingWorker: { verification_status: 'under_review', is_suspended: true },
    })

    const result = await registerWorker('user-1', VALID_INPUT, supabase)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ALREADY_FINALIZED')
      expect(result.status).toBe(409)
    }
  })

  it('allows re-submission when status is draft/submitted/under_review/rejected', async () => {
    for (const status of ['draft', 'submitted', 'under_review', 'rejected']) {
      const supabase = makeMockSupabase({
        profile: { role: 'worker' },
        existingWorker: { verification_status: status },
        upsertResult: { id: 'user-1', verification_status: 'submitted' },
      })
      const result = await registerWorker('user-1', VALID_INPUT, supabase)
      expect(result.success, `status=${status} should allow re-submit`).toBe(true)
    }
  })

  it('rejects unknown worker districts instead of granting city-wide coverage', async () => {
    const supabase = makeMockSupabase({
      profile: { role: 'worker' },
      existingWorker: null,
    })

    const result = await registerWorker('user-1', {
      ...VALID_INPUT,
      districts: ['Hà Nội'],
    }, supabase)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION')
      expect(result.status).toBe(400)
    }
    expect(supabase.from).toHaveBeenCalledTimes(2)
  })

  it('allows explicit city-wide coverage only when the worker selects hcmc_all', async () => {
    const supabase = makeMockSupabase({
      profile: { role: 'worker' },
      existingWorker: null,
      upsertResult: { id: 'user-1', verification_status: 'submitted' },
    })

    const result = await registerWorker('user-1', {
      ...VALID_INPUT,
      districts: ['hcmc_all'],
    }, supabase)

    expect(result.success).toBe(true)
    expect(supabase.from).toHaveBeenCalledTimes(3)
  })

  it('returns DB_ERROR when upsert fails', async () => {
    const supabase = makeMockSupabase({
      profile: { role: 'worker' },
      existingWorker: null,
      upsertResult: null,
      upsertError: { code: 'PGRST500' },
    })

    const result = await registerWorker('user-1', VALID_INPUT, supabase)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('DB_ERROR')
    }
  })
})
