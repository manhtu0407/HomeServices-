import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, WorkerRegisterInput, WorkerVerificationStatus } from '@nestscout/shared'
import { HCMC_DISTRICTS, normalizeDistrict } from '@nestscout/shared'
import { postgresNullableRpcArg, withDbTimeout } from '@/lib/db/query'

export type WorkerRegisterResult =
  | { success: true; workerId: string; verificationStatus: WorkerVerificationStatus; submittedAt: string }
  | { success: false; error: string; code: string; status: number }

/**
 * B0 — Worker registration submission.
 *
 * Persists CCCD/bank/skills and transitions verification_status to 'submitted'
 * through the row-locking registration RPC. Admin must manually review and
 * approve (B1) before the worker can receive jobs.
 *
 * Per RULES.md #9 — never log PII (legal_name, dob, bank account, CCCD urls).
 */
export async function registerWorker(
  userId: string,
  input: WorkerRegisterInput,
  supabase: SupabaseClient<Database>,
): Promise<WorkerRegisterResult> {
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

  const { data, error } = await withDbTimeout(
    supabase.rpc('submit_worker_registration_atomic', {
      p_actor_id: userId,
      p_worker_id: userId,
      p_legal_name: input.legal_name,
      p_date_of_birth: input.date_of_birth,
      p_gender: postgresNullableRpcArg(input.gender ?? null),
      p_service_types: input.service_types,
      p_years_experience: input.years_experience,
      p_districts: canonicalDistricts,
      p_home_lat: postgresNullableRpcArg(input.home_lat ?? null),
      p_home_lng: postgresNullableRpcArg(input.home_lng ?? null),
      p_service_radius_km: input.service_radius_km ?? 8,
      p_problem_specializations: input.problem_specializations ?? [],
      p_cccd_front_url: input.cccd_front_url,
      p_cccd_back_url: input.cccd_back_url,
      p_selfie_url: input.selfie_url,
      p_bank_account: input.bank_account,
      p_bank_name: input.bank_name,
    }),
  )
  const row = data?.[0]

  if (error || !row) {
    console.warn('Worker register: atomic RPC failed', { userId, errorCode: error?.code })
    return { success: false, error: 'Không thể lưu hồ sơ', code: 'DB_ERROR', status: 500 }
  }
  if (!row.ok) return mapWorkerRegistrationError(row.error_code)
  if (!row.worker_id_out || !row.verification_status_out || !row.submitted_at_ts) {
    console.warn('Worker register: atomic RPC returned an incomplete success row', { userId })
    return { success: false, error: 'Không thể lưu hồ sơ', code: 'DB_ERROR', status: 500 }
  }

  return {
    success: true,
    workerId: row.worker_id_out,
    verificationStatus: row.verification_status_out,
    submittedAt: row.submitted_at_ts,
  }
}

function mapWorkerRegistrationError(errorCode: string | null): WorkerRegisterResult {
  if (errorCode === 'NOT_FOUND') {
    return { success: false, error: 'Không tìm thấy hồ sơ', code: 'NOT_FOUND', status: 404 }
  }
  if (errorCode === 'WRONG_ROLE') {
    return {
      success: false,
      error: 'Tài khoản này không phải tài khoản thợ',
      code: 'WRONG_ROLE',
      status: 403,
    }
  }
  if (errorCode === 'NOT_OWNER') {
    return {
      success: false,
      error: 'Bạn chỉ có thể gửi hồ sơ của chính mình',
      code: 'NOT_OWNER',
      status: 403,
    }
  }
  if (errorCode === 'ALREADY_FINALIZED') {
    return {
      success: false,
      error: 'Hồ sơ đang được xem xét, đã được duyệt hoặc bị khóa. Liên hệ hỗ trợ để cập nhật.',
      code: 'ALREADY_FINALIZED',
      status: 409,
    }
  }
  if (errorCode === 'INVALID_INPUT') {
    return {
      success: false,
      error: 'Dữ liệu hồ sơ không hợp lệ',
      code: 'VALIDATION',
      status: 400,
    }
  }
  return { success: false, error: 'Không thể lưu hồ sơ', code: 'DB_ERROR', status: 500 }
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
