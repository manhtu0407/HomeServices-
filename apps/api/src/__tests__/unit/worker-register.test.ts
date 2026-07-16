import { describe, it, expect, vi } from 'vitest'
import { workerRegisterSchema } from '@nestscout/shared'

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
  postgresNullableRpcArg: <T,>(value: T | null) => value as T,
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
    cccd_front_url: 'supabase://worker-verification/11111111-1111-4111-8111-111111111111/cccd-front/front.jpg',
    cccd_back_url: 'supabase://worker-verification/11111111-1111-4111-8111-111111111111/cccd-back/back.jpg',
    selfie_url: 'supabase://worker-verification/11111111-1111-4111-8111-111111111111/selfie/selfie.jpg',
    bank_account: '0123456789',
    bank_name: 'Vietcombank',
  }

  it('accepts valid input', () => {
    expect(workerRegisterSchema.safeParse(VALID_INPUT).success).toBe(true)
  })

  it('accepts private Supabase worker-verification storage refs', () => {
    const result = workerRegisterSchema.safeParse({
      ...VALID_INPUT,
      cccd_front_url: 'supabase://worker-verification/22222222-2222-4222-8222-222222222222/cccd-front/front.jpg',
      cccd_back_url: 'supabase://worker-verification/22222222-2222-4222-8222-222222222222/cccd-back/back.jpg',
      selfie_url: 'supabase://worker-verification/22222222-2222-4222-8222-222222222222/selfie/selfie.jpg',
    })

    expect(result.success).toBe(true)
  })

  it('accepts all six launched service types', () => {
    const result = workerRegisterSchema.safeParse({
      ...VALID_INPUT,
      service_types: ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'],
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
      service_types: ['appliance_repair'],
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
  rpcResult?: Array<{
    ok: boolean
    error_code: string | null
    worker_id_out: string | null
    verification_status_out: string | null
    submitted_at_ts: string | null
    idempotent_out: boolean
  }> | null
  rpcError?: { code: string } | null
}) {
  const client = {
    from: vi.fn(() => {
      throw new Error('registerWorker must not bypass the atomic RPC')
    }),
    rpc: vi.fn(async () => {
      if (opts.rpcResult !== undefined || opts.rpcError) {
        return { data: opts.rpcResult ?? null, error: opts.rpcError ?? null }
      }
      if (opts.profileError || !opts.profile) {
        return {
          data: [{
            ok: false,
            error_code: 'NOT_FOUND',
            worker_id_out: null,
            verification_status_out: null,
            submitted_at_ts: null,
            idempotent_out: false,
          }],
          error: null,
        }
      }
      if (opts.profile.role !== 'worker') {
        return {
          data: [{
            ok: false,
            error_code: 'WRONG_ROLE',
            worker_id_out: null,
            verification_status_out: null,
            submitted_at_ts: null,
            idempotent_out: false,
          }],
          error: null,
        }
      }
      if (opts.existingError) {
        return { data: null, error: opts.existingError }
      }
      if (
        opts.existingWorker &&
        (opts.existingWorker.verification_status === 'under_review' ||
          opts.existingWorker.verification_status === 'approved' ||
          opts.existingWorker.verification_status === 'suspended' ||
          opts.existingWorker.is_suspended === true)
      ) {
        return {
          data: [{
            ok: false,
            error_code: 'ALREADY_FINALIZED',
            worker_id_out: 'user-1',
            verification_status_out: opts.existingWorker.verification_status,
            submitted_at_ts: '2026-07-14T10:50:00.000Z',
            idempotent_out: false,
          }],
          error: null,
        }
      }
      if (opts.upsertError || !opts.upsertResult) {
        return { data: null, error: opts.upsertError ?? { code: 'PGRST500' } }
      }
      return {
        data: [{
          ok: true,
          error_code: null,
          worker_id_out: opts.upsertResult.id,
          verification_status_out: opts.upsertResult.verification_status,
          submitted_at_ts: '2026-07-14T10:50:00.000Z',
          idempotent_out: false,
        }],
        error: null,
      }
    }),
  } as any
  return client
}

const VALID_INPUT = {
  legal_name: 'Nguyễn Văn A',
  date_of_birth: '1990-01-15',
  gender: 'male' as const,
  service_types: ['electrical' as const],
  years_experience: 5,
  districts: ['Quận 1'],
  cccd_front_url: 'supabase://worker-verification/11111111-1111-4111-8111-111111111111/cccd-front/front.jpg',
  cccd_back_url: 'supabase://worker-verification/11111111-1111-4111-8111-111111111111/cccd-back/back.jpg',
  selfie_url: 'supabase://worker-verification/11111111-1111-4111-8111-111111111111/selfie/selfie.jpg',
  bank_account: '0123456789',
  bank_name: 'Vietcombank',
}

describe('registerWorker', () => {
  it('delegates profile validation and finalization to the atomic registration RPC', async () => {
    const supabase = makeMockSupabase({
      profile: { role: 'worker' },
      existingWorker: null,
      upsertResult: { id: 'user-1', verification_status: 'submitted' },
      rpcResult: [{
        ok: true,
        error_code: null,
        worker_id_out: 'user-1',
        verification_status_out: 'submitted',
        submitted_at_ts: '2026-07-14T10:50:00.000Z',
        idempotent_out: false,
      }],
    })

    const result = await registerWorker('user-1', VALID_INPUT, supabase)

    expect(result).toMatchObject({
      success: true,
      workerId: 'user-1',
      verificationStatus: 'submitted',
      submittedAt: '2026-07-14T10:50:00.000Z',
    })
    expect(supabase.rpc).toHaveBeenCalledWith(
      'submit_worker_registration_atomic',
      expect.objectContaining({
        p_actor_id: 'user-1',
        p_worker_id: 'user-1',
        p_districts: ['q1'],
        p_home_lat: null,
        p_home_lng: null,
        p_service_radius_km: 8,
        p_problem_specializations: [],
      }),
    )
    expect(supabase.from).not.toHaveBeenCalled()
  })

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

  it('preserves an under-review submission instead of resetting the review queue', async () => {
    const supabase = makeMockSupabase({
      profile: { role: 'worker' },
      existingWorker: { verification_status: 'under_review' },
    })

    const result = await registerWorker('user-1', VALID_INPUT, supabase)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ALREADY_FINALIZED')
      expect(result.status).toBe(409)
    }
  })

  it('allows re-submission when status is draft, submitted, or rejected', async () => {
    for (const status of ['draft', 'submitted', 'rejected']) {
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
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
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
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns DB_ERROR when the registration RPC fails', async () => {
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
