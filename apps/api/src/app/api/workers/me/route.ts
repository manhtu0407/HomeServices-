import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { withDbTimeout } from '@/lib/db/query'
import { maskBankAccount, blankWorkerProfile } from '@/lib/workers/register'

/**
 * GET /api/workers/me — Worker reads own profile + verification status.
 *
 * Returns PII fields (legal_name, date_of_birth, gender) only to the owner.
 * Bank account is masked to last 4 digits (****1234).
 * Per RULES.md #9 — full PII never returned in this endpoint logs.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request, ['worker'])
  if (!auth.success) {
    return apiError(
      auth.status === 401 ? 'AUTH_MISSING' : 'AUTH_FORBIDDEN',
      auth.error,
      auth.status,
    )
  }

  const { data: worker, error } = await withDbTimeout(
    auth.supabase
      .from('worker_profiles')
      .select('id, verification_status, is_available, is_approved, is_suspended, service_types, districts, years_experience, rating, total_jobs, legal_name, date_of_birth, gender, bank_account, bank_name, cccd_front_url, cccd_back_url, selfie_url')
      .eq('id', auth.user.id)
      .maybeSingle(),
  )

  if (error) {
    console.warn('GET /workers/me: query failed', { userId: auth.user.id, errorCode: error.code })
    return apiError('DB_ERROR', 'Không thể tải hồ sơ', 500)
  }

  if (!worker) {
    // Worker has auth profile but no worker_profile yet — return blank-state shape
    return apiSuccess(blankWorkerProfile(auth.user.id))
  }

  return apiSuccess({
    id: worker.id,
    verification_status: worker.verification_status,
    is_available: worker.is_available,
    is_approved: worker.is_approved,
    is_suspended: worker.is_suspended,
    service_types: worker.service_types,
    districts: worker.districts,
    years_experience: worker.years_experience,
    rating: worker.rating,
    total_jobs: worker.total_jobs,
    legal_name: worker.legal_name,
    date_of_birth: worker.date_of_birth,
    gender: worker.gender,
    bank_account_masked: maskBankAccount(worker.bank_account),
    bank_name: worker.bank_name,
    has_cccd: Boolean(worker.cccd_front_url && worker.cccd_back_url),
    has_selfie: Boolean(worker.selfie_url),
  })
}
