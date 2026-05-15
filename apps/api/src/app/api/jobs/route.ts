import { authenticateRequest, apiError, apiSuccess } from '@/lib/auth/api-auth'
import { jobCreateSchema, sanitizeForLLM } from '@home-services/shared'
import { runKaelPipeline } from '@/lib/kael/pipeline'
import { validateTransition } from '@/lib/jobs/lifecycle'
import { logJobEvent } from '@/lib/jobs/event-log'
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
    return apiError(
      'RATE_LIMITED',
      'Vui lòng thử lại sau',
      429,
    )
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

  const input = parsed.data

  // Insert draft job
  const { data: job, error: insertError } = await auth.supabase
    .from('jobs')
    .insert({
      customer_id: auth.user.id,
      service_type: input.service_type,
      description: sanitizeForLLM(input.description),
      problem_chips: input.problem_chips,
      photo_urls: input.photo_urls,
      address_building: input.address_building ?? null,
      address_unit: input.address_unit ?? null,
      address_floor: input.address_floor ?? null,
      address_district: input.address_district ?? null,
      scheduled_at: input.scheduled_at ?? null,
      status: 'draft',
    })
    .select('id')
    .single()

  if (insertError || !job) {
    return apiError('DB_ERROR', 'Không thể tạo yêu cầu', 500)
  }

  // Transition draft → analyzing
  const toAnalyzing = validateTransition('draft', 'analyzing')
  if (!toAnalyzing.valid) {
    return apiError('INVALID_STATUS', toAnalyzing.error, 409)
  }

  const { error: analyzingErr } = await auth.supabase
    .from('jobs')
    .update({ status: 'analyzing' })
    .eq('id', job.id)

  if (analyzingErr) {
    return apiError('DB_ERROR', 'Không thể cập nhật trạng thái', 500)
  }

  await logJobEvent(auth.supabase, job.id, 'status_change', auth.user.id, 'customer', 'draft', 'analyzing')

  // Run Kael pipeline (Rule #2: all AI through callAI wrapper)
  const pipelineResult = await runKaelPipeline(
    {
      serviceType: input.service_type,
      problemChips: input.problem_chips,
      description: input.description,
      district: input.address_district ?? 'default',
    },
    auth.supabase,
  )

  if (!pipelineResult.success) {
    // Fallback: revert to draft
    await auth.supabase
      .from('jobs')
      .update({ status: 'draft' })
      .eq('id', job.id)

    await logJobEvent(auth.supabase, job.id, 'kael_failed', auth.user.id, 'customer', 'analyzing', 'draft')

    if (pipelineResult.code === 'UNSUPPORTED') {
      return apiError('UNSUPPORTED', pipelineResult.error, 400)
    }

    return apiError('AI_FAILED', 'Hệ thống đang xử lý. Vui lòng thử lại.', 502)
  }

  const { estimate, fallbackUsed } = pipelineResult
  const now = new Date().toISOString()

  // Transition analyzing → estimate_ready (respects state machine)
  const toEstimateReady = validateTransition('analyzing', 'estimate_ready')
  if (!toEstimateReady.valid) {
    return apiError('INVALID_STATUS', toEstimateReady.error, 409)
  }

  const { error: estUpdateErr } = await auth.supabase
    .from('jobs')
    .update({
      status: 'estimate_ready',
      kael_problem_identified: estimate.problem_summary,
      kael_complexity: estimate.complexity,
      kael_price_min: estimate.price_min,
      kael_price_max: estimate.price_max,
      kael_advisory: estimate.advisory,
      estimate_ready_at: now,
    })
    .eq('id', job.id)

  if (estUpdateErr) {
    return apiError('DB_ERROR', 'Không thể cập nhật kết quả phân tích', 500)
  }

  await logJobEvent(auth.supabase, job.id, 'status_change', auth.user.id, 'customer', 'analyzing', 'estimate_ready')

  // Transition estimate_ready → awaiting_customer_confirm
  const toAwait = validateTransition('estimate_ready', 'awaiting_customer_confirm')
  if (!toAwait.valid) {
    return apiError('INVALID_STATUS', toAwait.error, 409)
  }

  const { error: awaitUpdateErr } = await auth.supabase
    .from('jobs')
    .update({ status: 'awaiting_customer_confirm' })
    .eq('id', job.id)

  if (awaitUpdateErr) {
    return apiError('DB_ERROR', 'Không thể cập nhật trạng thái', 500)
  }

  await logJobEvent(auth.supabase, job.id, 'status_change', auth.user.id, 'customer', 'estimate_ready', 'awaiting_customer_confirm')

  return apiSuccess({
    job_id: job.id,
    status: 'awaiting_customer_confirm',
    estimate: {
      service_type: estimate.service_type,
      problem_category: estimate.problem_category,
      problem_summary: estimate.problem_summary,
      complexity: estimate.complexity,
      price_min: estimate.price_min,
      price_max: estimate.price_max,
      confidence: estimate.confidence,
      advisory: estimate.advisory,
      disclaimer: estimate.disclaimer,
    },
    fallback_used: fallbackUsed,
  }, 201)
}

