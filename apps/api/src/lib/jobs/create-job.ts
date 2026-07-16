import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ApartmentAccessProfileInput,
  Database,
  JobCreateInput,
  KaelEstimate,
} from '@nestscout/shared'
import { sanitizeForLLM, normalizeServiceAreaDistrict } from '@nestscout/shared'
import { runKaelPipeline, type PipelineResult } from '@/lib/kael/pipeline'
import { logJobEvent, type EventActor } from '@/lib/jobs/event-log'
import { withDbTimeout } from '@/lib/db/query'
import { logApiCalls, generateRequestId, type ApiCallLog } from '@/lib/kael/log-api-call'
import { AI_SESSION_LIMIT, checkRateLimit } from '@/lib/rate-limit'

export type CreateJobResult =
  | {
      success: true
      jobId: string
      status: string
      estimate: KaelEstimate
      fallbackUsed: boolean
    }
  | { success: false; error: string; code: string; status: number }

// Static stage → provider/model lookup. Co-located so model upgrades touch one place.
const PROVIDER_MAP = {
  intent: { provider: 'deepseek' as const, model: 'deepseek-v4-flash' },
  vision: { provider: 'anthropic' as const, model: 'claude-sonnet-4-6' },
  market: { provider: 'perplexity' as const, model: 'sonar' },
} as const

type LoggableStage = keyof typeof PROVIDER_MAP
type JobRow = Database['public']['Tables']['jobs']['Row']
type ExistingJobRow = Pick<JobRow, 'id' | 'status' | 'service_type' | 'kael_estimate_card_v3'>

const EXISTING_JOB_SELECT = 'id, status, service_type, kael_estimate_card_v3'
const APARTMENT_ACCESS_PROFILE_KEYS = [
  'entry_method',
  'parking_note',
  'guard_note',
  'building_note',
  'customer_handoff_note',
] as const satisfies ReadonlyArray<keyof ApartmentAccessProfileInput>
const OFF_APP_CONTACT_PATTERNS = [
  /\b(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b(?:sdt|so dien thoai|zalo|za lo)\b/i,
  /\b(?:goi em|goi anh|goi rieng|so rieng)\b/i,
  /\b(?:tien mat|cash|khong qua app|ngoai app|truc tiep|ra ngoai app)\b/i,
] as const

function isLoggableStage(s: string): s is LoggableStage {
  return s === 'intent' || s === 'vision' || s === 'market'
}

function apiLogPurposeForPipelineStage(stage: LoggableStage): string {
  switch (stage) {
    case 'intent':
      return 'intent_classification'
    case 'vision':
      return 'vision_analysis'
    case 'market':
      return 'market_lookup'
  }
}

/**
 * Orchestrates A3-A5: create job, run Kael pipeline, persist estimate.
 *
 * Hot-path optimizations (Audit Tier A):
 *  - INSERT directly as 'analyzing' instead of 'draft' + UPDATE (saves 1 op)
 *  - Single UPDATE to 'awaiting_customer_confirm' with all kael fields + estimate_ready_at
 *    (saves 1 UPDATE + 1 logJobEvent vs old 2-step transition)
 *  - Batched API-call logging via logApiCalls (3 INSERTs -> 1)
 *  - Removed runtime validateTransition for fixed internal sequences (state
 *    machine validation is reserved for cross-boundary calls like worker
 *    status updates)
 *
 * Result: ~10 DB round trips → ~5 (50% reduction on the POST /api/jobs hot path).
 */
export async function createJobWithEstimate(
  input: JobCreateInput,
  actor: EventActor,
  supabase: SupabaseClient<Database>,
): Promise<CreateJobResult> {
  const canonicalDistrict = normalizeServiceAreaDistrict(input.address_district)
  if (!canonicalDistrict) {
    return {
      success: false,
      error: 'Địa chỉ cần có quận TP.HCM rõ ràng',
      code: 'VALIDATION',
      status: 400,
    }
  }

  if (input.client_request_id) {
    const existing = await findExistingJobByClientRequest(
      supabase,
      actor.id,
      input.client_request_id,
    )
    if (existing.error) {
      return { success: false, error: 'Không thể kiểm tra yêu cầu đã tạo', code: 'DB_ERROR', status: 500 }
    }
    if (existing.data) return buildExistingJobResult(existing.data)
  }

  if (isInvalidNewSchedule(input.scheduled_at)) {
    return {
      success: false,
      error: 'Thời gian hẹn phải ở tương lai và khớp múi giờ TP.HCM',
      code: 'VALIDATION',
      status: 400,
    }
  }

  const rateCheck = checkRateLimit(`job_create:${actor.id}`, AI_SESSION_LIMIT)
  if (!rateCheck.allowed) {
    return { success: false, error: 'Vui lòng thử lại sau', code: 'RATE_LIMITED', status: 429 }
  }

  // Correlation ID — every AI call in this pipeline run shares this id, so a
  // debugger can trace one user request through all 3 provider calls.
  const requestId = generateRequestId()

  // Op 1: Create job directly in 'analyzing' state. 'draft' was a vestigial
  // sentinel — never persisted (route always proceeds to AI immediately, or
  // transitions to 'cancelled' on failure via the cleanup path below).
  const { data: job, error: insertError } = await withDbTimeout(
    supabase
      .from('jobs')
      .insert({
        customer_id: actor.id,
        service_type: input.service_type,
        description: sanitizeForLLM(input.description),
        problem_chips: input.problem_chips,
        photo_urls: input.photo_urls,
        address_building: input.address_building ?? null,
        address_unit: input.address_unit ?? null,
        address_floor: input.address_floor ?? null,
        address_district: canonicalDistrict,
        apartment_access_profile: sanitizeApartmentAccessProfile(input.apartment_access_profile),
        apartment_access_state: buildInitialApartmentAccessState(),
        scheduled_at: input.scheduled_at ?? null,
        status: 'analyzing',
        client_request_id: input.client_request_id ?? null,
      })
      .select('id')
      .single(),
  )

  if (insertError?.code === '23505' && input.client_request_id) {
    const existing = await findExistingJobByClientRequest(
      supabase,
      actor.id,
      input.client_request_id,
    )
    if (existing.error) {
      return { success: false, error: 'Không thể tải lại yêu cầu đã tạo', code: 'DB_ERROR', status: 500 }
    }
    if (existing.data) return buildExistingJobResult(existing.data)
  }

  if (insertError || !job) {
    return { success: false, error: 'Không thể tạo yêu cầu', code: 'DB_ERROR', status: 500 }
  }

  // Op 2: Log creation (single event covering INSERT-as-analyzing).
  await logJobEvent(supabase, job.id, 'job_created', actor, null, 'analyzing')

  // Run AI pipeline (3 provider calls, baseline DB lookup, synthesis).
  let pipelineResult: PipelineResult
  try {
    pipelineResult = await runKaelPipeline(
      {
        serviceType: input.service_type,
        problemChips: input.problem_chips,
        description: input.description,
        district: canonicalDistrict,
        photoUrls: input.photo_urls,
      },
      supabase,
    )
  } catch {
    const cleanupOk = await cancelAnalyzingJob(supabase, job.id, actor, 'PIPELINE_THROW')
    if (!cleanupOk) {
      return {
        success: false,
        error: 'Không thể đóng yêu cầu sau lỗi hệ thống',
        code: 'DB_ERROR',
        status: 500,
      }
    }
    console.warn('Kael pipeline threw', { jobId: job.id, reasonCode: 'PIPELINE_THROW' })
    return {
      success: false,
      error: 'Hệ thống đang xử lý. Vui lòng thử lại.',
      code: 'AI_FAILED',
      status: 502,
    }
  }

  // Op 3: Batched provider logs (one INSERT, multiple rows).
  const apiLogs: ApiCallLog[] = []
  for (const stage of pipelineResult.stageLogs) {
    if (!isLoggableStage(stage.stage)) continue
    const meta = PROVIDER_MAP[stage.stage]
    apiLogs.push({
      jobId: job.id,
      requestId,
      purpose: apiLogPurposeForPipelineStage(stage.stage),
      provider: meta.provider,
      model: meta.model,
      latencyMs: stage.latencyMs,
      success: stage.success,
      errorCode: stage.failureReason,
    })
  }
  if (apiLogs.length > 0) {
    await logApiCalls(supabase, apiLogs)
  }

  if (!pipelineResult.success) {
    // Op 4 (fail path): Cancel cleanly — customer sees it in history as cancelled,
    // no orphan analyzing rows. Optimistic concurrency guards against double-write.
    const cleanupOk = await cancelAnalyzingJob(supabase, job.id, actor, pipelineResult.code)
    if (!cleanupOk) {
      return {
        success: false,
        error: 'Không thể đóng yêu cầu sau lỗi hệ thống',
        code: 'DB_ERROR',
        status: 500,
      }
    }

    if (pipelineResult.code === 'UNSUPPORTED') {
      return { success: false, error: pipelineResult.error, code: 'UNSUPPORTED', status: 400 }
    }
    if (pipelineResult.code === 'NO_BASELINE') {
      return { success: false, error: pipelineResult.error, code: 'NO_BASELINE', status: 502 }
    }
    return { success: false, error: 'Hệ thống đang xử lý. Vui lòng thử lại.', code: 'AI_FAILED', status: 502 }
  }

  const { estimate, fallbackUsed } = pipelineResult
  const now = new Date().toISOString()

  // Op 4 (success path): Single UPDATE writes kael fields + estimate_ready_at
  // and transitions all the way to 'awaiting_customer_confirm'. The previous
  // 'estimate_ready' intermediate state is collapsed into one step since it
  // never required external action — customer always sees estimate_ready and
  // awaiting_customer_confirm as the same UI screen.
  //
  // Optimistic concurrency: filter on status='analyzing' so a concurrent
  // cancel (admin manual edit, future cancel-job route) cannot have its state
  // overwritten by stale AI output. .maybeSingle() + null check surfaces the
  // 0-row case as STATUS_CHANGED instead of silently returning success with a
  // job that doesn't actually carry the estimate.
  const { data: updated, error: estUpdateErr } = await withDbTimeout(
    supabase
      .from('jobs')
      .update({
        status: 'awaiting_customer_confirm',
        kael_problem_identified: estimate.problem_summary,
        kael_complexity: estimate.complexity,
        kael_price_min: estimate.price_min,
        kael_price_max: estimate.price_max,
        kael_advisory: estimate.advisory,
        kael_estimate_card_v3: {
          estimate,
          fallback_used: fallbackUsed,
        },
        service_problem_id: pipelineResult.serviceProblemId,
        estimate_ready_at: now,
      })
      .eq('id', job.id)
      .eq('status', 'analyzing')
      .select('id')
      .maybeSingle(),
  )

  if (estUpdateErr) {
    const cleanupOk = await cancelAnalyzingJob(
      supabase,
      job.id,
      actor,
      'ESTIMATE_PERSIST_FAILED',
    )
    if (!cleanupOk) {
      return { success: false, error: 'Không thể đóng yêu cầu sau lỗi hệ thống', code: 'DB_ERROR', status: 500 }
    }
    return { success: false, error: 'Không thể cập nhật kết quả phân tích', code: 'DB_ERROR', status: 500 }
  }

  if (!updated) {
    // Status changed mid-pipeline (cancelled or otherwise). Estimate is
    // discarded; the user's last action wins.
    await logJobEvent(supabase, job.id, 'estimate_dropped_status_changed', actor, 'analyzing', null, {
      reason: 'job status changed during AI pipeline',
    })
    return {
      success: false,
      error: 'Trạng thái yêu cầu đã thay đổi. Vui lòng tải lại và thử lại.',
      code: 'STATUS_CHANGED',
      status: 409,
    }
  }

  // Op 5: Single event covering the analyzing → awaiting_customer_confirm
  // transition (with estimate_ready as the meaningful waypoint in metadata).
  await logJobEvent(
    supabase,
    job.id,
    'estimate_ready',
    actor,
    'analyzing',
    'awaiting_customer_confirm',
    { fallback_used: fallbackUsed },
  )

  return {
    success: true,
    jobId: job.id,
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
    fallbackUsed,
  }
}

async function findExistingJobByClientRequest(
  supabase: SupabaseClient<Database>,
  customerId: string,
  clientRequestId: string,
) {
  return withDbTimeout(
    supabase
      .from('jobs')
      .select(EXISTING_JOB_SELECT)
      .eq('customer_id', customerId)
      .eq('client_request_id', clientRequestId)
      .maybeSingle(),
  )
}

function buildExistingJobResult(job: ExistingJobRow): CreateJobResult {
  const card = asRecord(job.kael_estimate_card_v3)
  const estimate = readEstimateSnapshot(card?.estimate, job.service_type)
  const fallbackUsed = card?.fallback_used
  if (!estimate || typeof fallbackUsed !== 'boolean') {
    return {
      success: false,
      error: 'Yêu cầu đã được tạo và đang được Kael phân tích. Vui lòng tải lại sau.',
      code: 'JOB_PENDING',
      status: 409,
    }
  }
  return {
    success: true,
    jobId: job.id,
    status: job.status,
    estimate,
    fallbackUsed,
  }
}

function readEstimateSnapshot(value: unknown, serviceType: JobRow['service_type']): KaelEstimate | null {
  const estimate = asRecord(value)
  if (!estimate || estimate.service_type !== serviceType) return null
  if (typeof estimate.problem_category !== 'string' || !estimate.problem_category.trim()) return null
  if (typeof estimate.problem_summary !== 'string' || !estimate.problem_summary.trim()) return null
  if (!isComplexity(estimate.complexity)) return null
  if (!isPositiveFiniteNumber(estimate.price_min) || !isPositiveFiniteNumber(estimate.price_max)) return null
  if (estimate.price_max < estimate.price_min) return null
  if (typeof estimate.confidence !== 'number' || !Number.isFinite(estimate.confidence)) return null
  if (estimate.confidence < 0 || estimate.confidence > 1) return null
  if (estimate.advisory !== null && typeof estimate.advisory !== 'string') return null
  if (typeof estimate.disclaimer !== 'string' || !estimate.disclaimer.trim()) return null
  return {
    service_type: serviceType,
    problem_category: estimate.problem_category,
    problem_summary: estimate.problem_summary,
    complexity: estimate.complexity,
    price_min: estimate.price_min,
    price_max: estimate.price_max,
    confidence: estimate.confidence,
    advisory: estimate.advisory,
    disclaimer: estimate.disclaimer,
  }
}

function sanitizeApartmentAccessProfile(
  input: ApartmentAccessProfileInput | undefined,
): ApartmentAccessProfileInput {
  const profile: ApartmentAccessProfileInput = {}
  for (const key of APARTMENT_ACCESS_PROFILE_KEYS) {
    const raw = input?.[key]
    if (typeof raw !== 'string') continue
    const value = sanitizeForLLM(raw).slice(0, 300)
    if (!value || containsOffAppContact(value)) continue
    profile[key] = value
  }
  return profile
}

function buildInitialApartmentAccessState() {
  return {
    release_stage: 'area_only',
    exact_unit_released: false,
    check_in_required: true,
    identity_check_required: true,
    customer_handoff_required: true,
    evidence_mode: 'none',
  }
}

function containsOffAppContact(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
  return OFF_APP_CONTACT_PATTERNS.some((pattern) => pattern.test(value) || pattern.test(normalized))
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isComplexity(value: unknown): value is KaelEstimate['complexity'] {
  return value === 'small' || value === 'medium' || value === 'large'
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isInvalidNewSchedule(value: string | undefined) {
  if (!value) return false
  const scheduledMs = Date.parse(value)
  return !Number.isFinite(scheduledMs) || scheduledMs <= Date.now()
}

async function cancelAnalyzingJob(
  supabase: SupabaseClient<Database>,
  jobId: string,
  actor: EventActor,
  reasonCode: string,
): Promise<boolean> {
  const cancelledAt = new Date().toISOString()
  try {
    const { data, error } = await withDbTimeout(
      supabase
        .from('jobs')
        .update({
          status: 'cancelled',
          cancelled_at: cancelledAt,
          client_request_id: null,
        })
        .eq('id', jobId)
        .eq('status', 'analyzing')
        .select('id')
        .maybeSingle(),
    )
    if (error) {
      console.warn('Failed to cancel analyzing job', {
        jobId,
        reasonCode,
        errorCode: error.code,
      })
      return false
    }
    if (!data) {
      console.warn('Cancel analyzing job matched no rows', { jobId, reasonCode })
      return false
    }
  } catch {
    console.warn('Failed to cancel analyzing job', { jobId, reasonCode })
    return false
  }

  await logJobEvent(supabase, jobId, 'kael_failed', actor, 'analyzing', 'cancelled', {
    reason_code: reasonCode,
  })
  return true
}
