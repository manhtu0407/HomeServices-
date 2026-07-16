import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { jobCreateSchema } from '@nestscout/shared'
import { createJobWithEstimate } from '@/lib/jobs/create-job'
import { readJsonRequestBounded } from '@/lib/http/request-json'

export async function POST(request: Request) {
  const auth = await authenticateRequest(request, ['customer'])
  if (!auth.success) {
    return apiError(
      auth.code,
      auth.error,
      auth.status,
    )
  }

  let body: unknown
  try {
    body = await readJsonRequestBounded(request)
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
