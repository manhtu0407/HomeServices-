import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, JobCreateInput } from '@home-services/shared'
import { sanitizeForLLM, normalizeServiceAreaDistrict } from '@home-services/shared'
import { runKaelPipeline, type PipelineResult } from '@/lib/kael/pipeline'
import { logJobEvent, type EventActor } from '@/lib/jobs/event-log'
import { withDbTimeout } from '@/lib/db/query'
import { logApiCalls, generateRequestId, type ApiCallLog } from '@/lib/kael/log-api-call'

export type CreateJobResult =
  | {
      success: true
      jobId: string
      status: string
      estimate: {
        service_type: string
        problem_category: string
        problem_summary: string
        complexity: string
        price_min: number
        price_max: number
        confidence: number
        advisory: string | null
        disclaimer: string
      }
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

function isLoggableStage(s: string): s is LoggableStage {
  return s === 'intent' || s === 'vision' || s === 'market'
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
        scheduled_at: input.scheduled_at ?? null,
        status: 'analyzing',
      })
      .select('id')
      .single(),
  )

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
        service_problem_id: pipelineResult.serviceProblemId,
        estimate_ready_at: now,
      })
      .eq('id', job.id)
      .eq('status', 'analyzing')
      .select('id')
      .maybeSingle(),
  )

  if (estUpdateErr) {
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
        .update({ status: 'cancelled', cancelled_at: cancelledAt })
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
