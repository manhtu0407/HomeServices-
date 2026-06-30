import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { jobCreateSchema } from '@nestscout/shared'
import { createJobWithEstimate } from '@/lib/jobs/create-job'
import { checkRateLimit, AI_SESSION_LIMIT } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const auth = await authenticateRequest(request, ['customer'])
  if (!auth.success) {
    return apiError(
      auth.status === 401 ? 'AUTH_MISSING' : 'AUTH_FORBIDDEN',
      auth.error,
      auth.status,
    )
  }

  const rateCheck = checkRateLimit(`job_create:${auth.user.id}`, AI_SESSION_LIMIT)
  if (!rateCheck.allowed) {
    return apiError('RATE_LIMITED', 'Vui lòng thử lại sau', 429)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const parsed = jobCreateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VALIDATION', 'Dữ liệu không hợp lệ', 400)
  }

  const result = await createJobWithEstimate(
    parsed.data,
    { id: auth.user.id, role: 'customer' },
    auth.supabase,
  )

  if (!result.success) {
    return apiError(result.code, result.error, result.status)
  }

  return apiSuccess({
    job_id: result.jobId,
    status: result.status,
    estimate: result.estimate,
    fallback_used: result.fallbackUsed,
  }, 201)
}
