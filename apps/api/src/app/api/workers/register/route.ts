import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { workerRegisterSchema } from '@nestscout/shared'
import { registerWorker } from '@/lib/workers/register'
import { checkRateLimit, AI_SESSION_LIMIT } from '@/lib/rate-limit'

/**
 * POST /api/workers/register — B0
 *
 * Worker submits identity + skill information. Transitions verification_status
 * from draft to submitted. Admin (B1) must approve before worker can accept jobs.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request, ['worker'])
  if (!auth.success) {
    return apiError(
      auth.status === 401 ? 'AUTH_MISSING' : 'AUTH_FORBIDDEN',
      auth.error,
      auth.status,
    )
  }

  const rateCheck = checkRateLimit(`worker_register:${auth.user.id}`, AI_SESSION_LIMIT)
  if (!rateCheck.allowed) {
    return apiError('RATE_LIMITED', 'Vui lòng thử lại sau', 429)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const parsed = workerRegisterSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const result = await registerWorker(auth.user.id, parsed.data, auth.supabase)
  if (!result.success) {
    return apiError(result.code, result.error, result.status)
  }

  return apiSuccess(
    {
      worker_id: result.workerId,
      verification_status: result.verificationStatus,
      submitted_at: result.submittedAt,
    },
    201,
  )
}
