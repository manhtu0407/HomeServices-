import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, WorkerRegisterInput, WorkerVerificationStatus } from '@nestscout/shared'
import { HCMC_DISTRICTS, normalizeDistrict } from '@nestscout/shared'
import { withDbTimeout } from '@/lib/db/query'

export type WorkerRegisterResult =
  | { success: true; workerId: string; verificationStatus: WorkerVerificationStatus; submittedAt: string }
  | { success: false; error: string; code: string; status: number }

/**
 * B0 — Worker registration submission.
 *
 * Upserts the worker_profiles row, persists CCCD/bank/skills, and transitions
 * verification_status to 'submitted'. Admin must manually review and approve
 * (B1) before the worker can receive jobs.
 *
 * Per RULES.md #9 — never log PII (legal_name, dob, bank account, CCCD urls).
 */
export async function registerWorker(
  userId: string,
  input: WorkerRegisterInput,
  supabase: SupabaseClient<Database>,
): Promise<WorkerRegisterResult> {
  // Pre-check: profile must be role=worker (avoid customer/admin path)
  const { data: profile, error: profileErr } = await withDbTimeout(
    supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single(),
  )

  if (profileErr || !profile) {
    console.warn('Worker register: profile lookup failed', {
      userId,
      errorCode: profileErr?.code,
    })
    return { success: false, error: 'Không tìm thấy hồ sơ', code: 'NOT_FOUND', status: 404 }
  }

  if (profile.role !== 'worker') {
    console.warn('Worker register: wrong role', { userId, role: profile.role })
    return { success: false, error: 'Tài khoản này không phải tài khoản thợ', code: 'WRONG_ROLE', status: 403 }
  }

  // Check existing worker_profile state — block re-submission if already approved/suspended
  const { data: existing, error: existingErr } = await withDbTimeout(
    supabase
      .from('worker_profiles')
      .select('verification_status, is_suspended')
      .eq('id', userId)
      .maybeSingle(),
  )

  if (existingErr) {
    console.warn('Worker register: existing lookup failed', { userId, errorCode: existingErr.code })
    return { success: false, error: 'Không thể tải hồ sơ thợ', code: 'DB_ERROR', status: 500 }
  }

  if (
    existing &&
    (existing.verification_status === 'approved' ||
      existing.verification_status === 'suspended' ||
      existing.is_suspended === true)
  ) {
    return {
      success: false,
      error: 'Hồ sơ đã được duyệt hoặc bị khóa. Liên hệ hỗ trợ để cập nhật.',
      code: 'ALREADY_FINALIZED',
      status: 409,
    }
  }

  const now = new Date().toISOString()
  const submittedStatus: WorkerVerificationStatus = 'submitted'

  // Normalize districts to canonical slugs so broadcast.ts queries match.
  // De-dupe in case worker entered "Q1" and "q1" both.
  const canonicalDistricts = normalizeWorkerDistricts(input.districts)
  if (!canonicalDistricts) {
    return {
      success: false,
      error: 'Khu vực làm việc không hợp lệ',
      code: 'VALIDATION',
      status: 400,
    }
  }

  const { data: upserted, error: upsertErr } = await withDbTimeout(
    supabase
      .from('worker_profiles')
      .upsert({
        id: userId,
        legal_name: input.legal_name,
        date_of_birth: input.date_of_birth,
        gender: input.gender ?? null,
        service_types: input.service_types,
        years_experience: input.years_experience,
        districts: canonicalDistricts,
        cccd_front_url: input.cccd_front_url,
        cccd_back_url: input.cccd_back_url,
        selfie_url: input.selfie_url,
        bank_account: input.bank_account,
        bank_name: input.bank_name,
        verification_status: submittedStatus,
        is_approved: false,
        is_available: false,
        is_suspended: false,
        updated_at: now,
      })
      .select('id, verification_status')
      .single(),
  )

  if (upsertErr || !upserted) {
    console.warn('Worker register: upsert failed', { userId, errorCode: upsertErr?.code })
    return { success: false, error: 'Không thể lưu hồ sơ', code: 'DB_ERROR', status: 500 }
  }

  return {
    success: true,
    workerId: upserted.id,
    verificationStatus: upserted.verification_status,
    submittedAt: now,
  }
}

function normalizeWorkerDistricts(districts: string[]): string[] | null {
  const normalized: string[] = []
  for (const district of districts) {
    const canonical = normalizeWorkerDistrict(district)
    if (!canonical) return null
    normalized.push(canonical)
  }
  return Array.from(new Set(normalized))
}

function normalizeWorkerDistrict(district: string): string | null {
  const canonical = normalizeDistrict(district)
  if (canonical !== 'hcmc_all') return canonical

  const trimmed = district.trim().toLowerCase()
  if (trimmed === 'hcmc_all' || trimmed === HCMC_DISTRICTS.hcmc_all.toLowerCase()) {
    return canonical
  }
  return null
}

/**
 * Mask bank account for display — shows last 4 digits only.
 * Returns null for empty/short inputs.
 */
export function maskBankAccount(account: string | null): string | null {
  if (!account || account.length < 4) return null
  return `****${account.slice(-4)}`
}

/**
 * Shape returned by GET /workers/me when worker has auth profile but no
 * worker_profiles row yet (pre-B0). Keeps the response shape stable so the
 * client never branches on "has profile / no profile".
 */
export type WorkerProfileShape = {
  id: string
  verification_status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'suspended'
  is_available: boolean
  is_approved: boolean
  is_suspended: boolean
  service_types: string[]
  districts: string[]
  years_experience: number
  rating: number
  total_jobs: number
  legal_name: string | null
  date_of_birth: string | null
  gender: string | null
  bank_account_masked: string | null
  bank_name: string | null
  has_cccd: boolean
  has_selfie: boolean
}

export function blankWorkerProfile(workerId: string): WorkerProfileShape {
  return {
    id: workerId,
    verification_status: 'draft',
    is_available: false,
    is_approved: false,
    is_suspended: false,
    service_types: [],
    districts: [],
    years_experience: 0,
    rating: 0,
    total_jobs: 0,
    legal_name: null,
    date_of_birth: null,
    gender: null,
    bank_account_masked: null,
    bank_name: null,
    has_cccd: false,
    has_selfie: false,
  }
}
