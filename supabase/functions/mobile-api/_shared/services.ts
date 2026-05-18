import type {
  BroadcastStatus,
  ComplexityLevel,
  JobStatus,
  ScopeChangeStatus,
  ServiceType,
  WorkerVerificationStatus,
} from "../../_shared/domain.ts";
import {
  HCMC_DISTRICTS,
  normalizeDistrict,
  normalizeServiceAreaDistrict,
  PLATFORM_FEE_WORKER,
} from "../../_shared/domain.ts";
import {
  type JobCreateInput,
  sanitizeForLLM,
  type WorkerRegisterInput,
} from "../../_shared/domain.ts";
import {
  apiFailure,
  type MobileApiContext,
  type MobileApiServices,
} from "./router.ts";
import { validateTransition } from "./lifecycle.ts";
import { AI_SESSION_LIMIT, checkRateLimit } from "./rate-limit.ts";
import {
  type EdgeAiSecrets,
  type PipelineResult,
  runKaelPipeline,
} from "./kael.ts";

type DbError = { code?: string; message?: string };
type DbResult<T> = {
  data: T | null;
  error: DbError | null;
  count?: number | null;
};
type QueryLike = PromiseLike<DbResult<unknown>>;

type DbClient = {
  from(table: string): Chain;
  rpc(name: string, args?: Record<string, unknown>): QueryLike;
};

const ACTIVE_WORKER_JOB_STATUSES: JobStatus[] = [
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
];
const DEFAULT_WORKER_CANDIDATE_POOL_SIZE = 50;

type Chain = {
  select(columns?: string, options?: unknown): Chain;
  insert(value: unknown): Chain;
  update(value: unknown): Chain;
  upsert(value: unknown): Chain;
  eq(column: string, value: unknown): Chain;
  neq(column: string, value: unknown): Chain;
  gt(column: string, value: unknown): Chain;
  gte(column: string, value: unknown): Chain;
  lte(column: string, value: unknown): Chain;
  in(column: string, value: unknown[]): Chain;
  contains(column: string, value: unknown[]): Chain;
  or(filter: string): Chain;
  order(column: string, options?: unknown): Chain;
  limit(count: number): Chain;
  single(): Chain;
  maybeSingle(): Chain;
  then<TResult1 = DbResult<unknown>, TResult2 = never>(
    onfulfilled?:
      | ((value: DbResult<unknown>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2>;
};

export function createEdgeServices(secrets: EdgeAiSecrets): MobileApiServices {
  return {
    listServices,
    createJob: (ctx, input) => createJob(ctx, input, secrets),
    getJob,
    confirmSearch,
    cancelJob,
    acceptBroadcast,
    declineBroadcast,
    updateJobStatus,
    requestScopeChange,
    decideScopeChange,
    confirmCompletion,
    submitReview,
    registerWorker,
    getWorkerProfile,
    updateWorkerAvailability,
    listWorkerBroadcasts,
    listWorkerJobs,
    getWorkerEarnings,
  };
}

async function listServices(ctx: MobileApiContext) {
  const client = db(ctx);
  const [catResult, probResult, baseResult] = await Promise.all([
    dbQuery<Array<Record<string, unknown>>>(
      client
        .from("service_categories")
        .select("id, service_type, slug, label_vi, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order"),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      client
        .from("service_problems")
        .select(
          "id, slug, label_vi, default_complexity, service_category_id, service_type, sort_order, is_active",
        )
        .eq("is_active", true)
        .order("sort_order"),
    ),
    dbQuery<Array<Record<string, unknown>>>(
      client
        .from("price_baselines")
        .select(
          "service_type, complexity, district_code, price_min, price_max, service_problem_id",
        ),
    ),
  ]);

  if (catResult.error) {
    apiFailure("DB_ERROR", "Không thể tải danh mục dịch vụ", 500);
  }
  if (probResult.error) {
    apiFailure("DB_ERROR", "Không thể tải danh sách vấn đề", 500);
  }
  if (baseResult.error) {
    apiFailure("DB_ERROR", "Không thể tải bảng giá nền", 500);
  }

  const categories = catResult.data ?? [];
  const problems = probResult.data ?? [];
  const baselines = baseResult.data ?? [];

  return {
    services: categories.map((cat) => ({
      id: asString(cat.id),
      service_type: cat.service_type as ServiceType,
      label_vi: asString(cat.label_vi),
      problems: problems
        .filter((p) => p.service_category_id === cat.id)
        .map((p) => ({
          id: asString(p.id),
          slug: asString(p.slug),
          label_vi: asString(p.label_vi),
          default_complexity: asComplexity(p.default_complexity),
        })),
      baselines: baselines
        .filter((b) => b.service_type === cat.service_type)
        .map(toCatalogBaseline)
        .filter(uniqueCatalogBaseline),
    })),
  };
}

async function createJob(
  ctx: MobileApiContext,
  input: JobCreateInput,
  secrets: EdgeAiSecrets,
) {
  const rateCheck = checkRateLimit(
    `job_create:${ctx.user.id}`,
    AI_SESSION_LIMIT,
  );
  if (!rateCheck.allowed) {
    apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
  }

  const client = db(ctx);
  const canonicalDistrict = normalizeServiceAreaDistrict(
    input.address_district,
  );
  if (!canonicalDistrict) {
    apiFailure("VALIDATION", "Địa chỉ cần có quận TP.HCM rõ ràng", 400);
  }
  const requestId = crypto.randomUUID();

  const inserted = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .insert({
        customer_id: ctx.user.id,
        service_type: input.service_type,
        description: sanitizeForLLM(input.description),
        problem_chips: input.problem_chips,
        photo_urls: input.photo_urls,
        address_building: input.address_building ?? null,
        address_unit: input.address_unit ?? null,
        address_floor: input.address_floor ?? null,
        address_district: canonicalDistrict,
        scheduled_at: input.scheduled_at ?? null,
        status: "analyzing",
      })
      .select("id")
      .single(),
  );

  if (inserted.error || !inserted.data) {
    apiFailure("DB_ERROR", "Không thể tạo yêu cầu", 500);
  }
  const jobId = inserted.data.id;
  await logJobEvent(client, jobId, "job_created", ctx, null, "analyzing");

  let pipeline: PipelineResult;
  try {
    pipeline = await runKaelPipeline(
      {
        serviceType: input.service_type,
        problemChips: input.problem_chips,
        description: input.description,
        district: canonicalDistrict,
      },
      client,
      secrets,
    );
  } catch {
    const cleanupOk = await cancelAnalyzingJob(
      client,
      jobId,
      ctx,
      "PIPELINE_THROW",
    );
    if (!cleanupOk) {
      apiFailure("DB_ERROR", "Không thể đóng yêu cầu sau lỗi hệ thống", 500);
    }
    console.warn("mobile-api Kael pipeline threw", {
      jobId,
      reasonCode: "PIPELINE_THROW",
    });
    apiFailure("AI_FAILED", "Hệ thống đang xử lý. Vui lòng thử lại.", 502);
  }

  await logApiCalls(
    client,
    pipeline.stageLogs
      .filter((stage) => stage.provider && stage.model)
      .map((stage) => ({
        job_id: jobId,
        request_id: requestId,
        provider: stage.provider,
        model: stage.model,
        input_tokens: stage.inputTokens ?? null,
        output_tokens: stage.outputTokens ?? null,
        cost_usd: stage.costUsd ?? null,
        latency_ms: stage.latencyMs,
        success: stage.success,
        error_code: stage.failureReason ?? null,
      })),
  );

  if (!pipeline.success) {
    const cleanupOk = await cancelAnalyzingJob(
      client,
      jobId,
      ctx,
      pipeline.code,
    );
    if (!cleanupOk) {
      apiFailure("DB_ERROR", "Không thể đóng yêu cầu sau lỗi hệ thống", 500);
    }
    if (pipeline.code === "UNSUPPORTED") {
      apiFailure("UNSUPPORTED", pipeline.error, 400);
    }
    if (pipeline.code === "NO_BASELINE") {
      apiFailure("NO_BASELINE", pipeline.error, 502);
    }
    apiFailure("AI_FAILED", "Hệ thống đang xử lý. Vui lòng thử lại.", 502);
  }

  const estimate = pipeline.estimate;
  const now = new Date().toISOString();
  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({
        status: "awaiting_customer_confirm",
        kael_problem_identified: estimate.problem_summary,
        kael_complexity: estimate.complexity,
        kael_price_min: estimate.price_min,
        kael_price_max: estimate.price_max,
        kael_advisory: estimate.advisory,
        service_problem_id: pipeline.serviceProblemId,
        estimate_ready_at: now,
      })
      .eq("id", jobId)
      .eq("status", "analyzing")
      .select("id")
      .maybeSingle(),
  );

  if (updated.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật kết quả phân tích", 500);
  }
  if (!updated.data) {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái yêu cầu đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }

  await logJobEvent(
    client,
    jobId,
    "estimate_ready",
    ctx,
    "analyzing",
    "awaiting_customer_confirm",
    {
      fallback_used: pipeline.fallbackUsed,
    },
  );

  return {
    job_id: jobId,
    status: "awaiting_customer_confirm" as JobStatus,
    estimate,
    fallback_used: pipeline.fallbackUsed,
  };
}

async function cancelAnalyzingJob(
  client: DbClient,
  jobId: string,
  actor: MobileApiContext,
  reasonCode: string,
): Promise<boolean> {
  const cancelledAt = new Date().toISOString();
  const cancelResult = await dbQuery(
    client
      .from("jobs")
      .update({ status: "cancelled", cancelled_at: cancelledAt })
      .eq("id", jobId)
      .eq("status", "analyzing")
      .select("id")
      .maybeSingle(),
  ).catch((error) => ({
    data: null,
    error: {
      code: "CLEANUP_THROW",
      message: error instanceof Error ? error.name : "cleanup failed",
    },
  }));

  if (cancelResult.error) {
    console.warn("mobile-api analyzing job cleanup failed", {
      jobId,
      reasonCode,
      errorCode: cancelResult.error.code,
    });
    return false;
  }
  if (!cancelResult.data) {
    console.warn("mobile-api analyzing job cleanup matched no rows", {
      jobId,
      reasonCode,
    });
    return false;
  }

  await logJobEvent(
    client,
    jobId,
    "kael_failed",
    actor,
    "analyzing",
    "cancelled",
    { reason_code: reasonCode },
  );
  return true;
}

async function getJob(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select(
        "id, status, service_type, description, problem_chips, photo_urls, address_building, address_unit, address_floor, address_district, scheduled_at, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_advisory, customer_id, worker_id, final_price, completion_notes, completion_photo_urls, created_at, matched_at, arrived_at, completed_at, confirmed_at, paid_at, reviewed_at",
      )
      .eq("id", jobId)
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  const job = result.data;
  assertJobOwnership(job, ctx);
  const broadcastState = job.status === "broadcasting"
    ? await getJobBroadcastState(client, jobId)
    : null;
  const currentScopeChange = job.status === "scope_change_pending"
    ? await getCurrentScopeChange(client, jobId)
    : null;

  return {
    job: {
      id: asString(job.id),
      status: asJobStatus(job.status),
      service_type: asServiceType(job.service_type),
      description: asString(job.description),
      problem_chips: asStringArray(job.problem_chips),
      photo_urls: asStringArray(job.photo_urls),
      address_building: nullableString(job.address_building),
      address_unit: nullableString(job.address_unit),
      address_floor: nullableString(job.address_floor),
      address_district: nullableString(job.address_district),
      scheduled_at: nullableString(job.scheduled_at),
      kael_problem_identified: nullableString(job.kael_problem_identified),
      kael_complexity: nullableComplexity(job.kael_complexity),
      kael_price_min: nullableNumber(job.kael_price_min),
      kael_price_max: nullableNumber(job.kael_price_max),
      kael_advisory: nullableString(job.kael_advisory),
      final_price: nullableNumber(job.final_price),
      completion_notes: nullableString(job.completion_notes),
      completion_photo_urls: asStringArray(job.completion_photo_urls),
      created_at: asString(job.created_at),
      matched_at: nullableString(job.matched_at),
      arrived_at: nullableString(job.arrived_at),
      completed_at: nullableString(job.completed_at),
      confirmed_at: nullableString(job.confirmed_at),
      paid_at: nullableString(job.paid_at),
      reviewed_at: nullableString(job.reviewed_at),
    },
    broadcast_state: broadcastState,
    current_scope_change: currentScopeChange,
  };
}

async function confirmSearch(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const now = new Date().toISOString();
  const jobResult = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select("id, status, customer_id, service_type, address_district")
      .eq("id", jobId)
      .single(),
  );
  if (jobResult.error || !jobResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  const job = jobResult.data;
  if (job.customer_id !== ctx.user.id) {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }

  const district = normalizeServiceAreaDistrict(
    nullableString(job.address_district) ?? "",
  );
  if (!district) {
    apiFailure(
      "VALIDATION",
      "Địa chỉ cần có quận TP.HCM rõ ràng",
      400,
    );
  }

  if (job.status === "broadcasting") {
    await expireStaleBroadcasts(client, jobId, now);
    if (await hasActiveBroadcast(client, jobId, now)) {
      apiFailure(
        "BROADCAST_ACTIVE",
        "Yêu cầu đang được gửi đến thợ. Vui lòng chờ phản hồi hiện tại.",
        409,
      );
    }
    if (!(await acquireBroadcastRetryLease(client, jobId, ctx.user.id, now))) {
      apiFailure(
        "BROADCAST_ACTIVE",
        "Yêu cầu đang được gửi đến thợ. Vui lòng chờ phản hồi hiện tại.",
        409,
      );
    }
    await logJobEvent(
      client,
      jobId,
      "customer_retried_search",
      ctx,
      "broadcasting",
      "broadcasting",
    );
  } else {
    const transition = validateTransition(
      job.status as JobStatus,
      "broadcasting",
    );
    if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

    const updated = await dbQuery<{ id: string }>(
      client
        .from("jobs")
        .update({
          status: "broadcasting",
          broadcast_at: now,
          confirmed_search_at: now,
        })
        .eq("id", jobId)
        .eq("customer_id", ctx.user.id)
        .eq("status", job.status)
        .select("id")
        .maybeSingle(),
    );
    if (updated.error) apiFailure("DB_ERROR", "Không thể bắt đầu tìm thợ", 500);
    if (!updated.data) {
      apiFailure(
        "STATUS_CHANGED",
        "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
        409,
      );
    }

    await logJobEvent(
      client,
      jobId,
      "customer_confirmed_search",
      ctx,
      job.status as JobStatus,
      "broadcasting",
    );
  }

  const broadcast = await createBroadcasts(
    client,
    jobId,
    job.service_type as ServiceType,
    district,
  );
  if (!broadcast.success) {
    if (broadcast.reasonCode === "DB_ERROR") {
      apiFailure("DB_ERROR", "Không thể gửi yêu cầu đến thợ", 500);
    }
    await logJobEvent(
      client,
      jobId,
      "no_worker_found",
      ctx,
      "broadcasting",
      null,
      {
        reason: broadcast.reason,
        district,
        service_type: job.service_type,
      },
    );
    return {
      job_id: jobId,
      status: "broadcasting" as JobStatus,
      broadcast_sent: false,
      worker: null,
      message: broadcast.reason,
    };
  }

  await logJobEvent(
    client,
    jobId,
    "broadcast_sent",
    ctx,
    "broadcasting",
    null,
    {
      batch_id: broadcast.batchId,
      worker_count: broadcast.broadcastCount,
    },
  );

  return {
    job_id: jobId,
    status: "broadcasting" as JobStatus,
    broadcast_sent: true,
    worker: null,
    message:
      `Đã gửi yêu cầu đến ${broadcast.broadcastCount} thợ. Đang chờ phản hồi.`,
  };
}

async function cancelJob(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("cancel_job_before_accept_atomic", {
      p_job_id: jobId,
      p_customer_id: ctx.user.id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể hủy yêu cầu", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể hủy yêu cầu", 500);
  if (!row.ok) mapCancelError(nullableString(row.error_code));

  await logJobEvent(
    client,
    jobId,
    "customer_cancelled_before_accept",
    ctx,
    null,
    "cancelled",
  );
  return { job_id: jobId, status: row.job_status as JobStatus };
}

async function acceptBroadcast(ctx: MobileApiContext, jobId: string) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("accept_broadcast_atomic", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
  if (!row.ok) {
    if (row.error_code === "EXPIRED") {
      await logJobEvent(db(ctx), jobId, "broadcast_expired", ctx, null, null, {
        reason: "EXPIRED via RPC",
      });
    }
    mapAcceptError(nullableString(row.error_code));
  }

  await logJobEvent(
    db(ctx),
    jobId,
    "worker_accepted",
    ctx,
    "broadcasting",
    "worker_matched",
  );
  return {
    job_id: jobId,
    status: row.job_status as JobStatus,
    full_address: {
      building: nullableString(row.address_building),
      unit: nullableString(row.address_unit),
      floor: nullableString(row.address_floor),
      district: nullableString(row.address_district),
    },
  };
}

async function declineBroadcast(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("job_broadcasts")
      .select("id, status, expires_at, jobs(status)")
      .eq("job_id", jobId)
      .eq("worker_id", ctx.user.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (result.error || !result.data) {
    apiFailure("NOT_FOUND", "Yêu cầu này không dành cho bạn", 404);
  }
  if (result.data.status !== "sent") {
    apiFailure("BROADCAST_NOT_ACTIVE", "Yêu cầu này đã được xử lý", 409);
  }
  const parentJob = relatedJob(result.data.jobs);
  if (!parentJob || parentJob.status !== "broadcasting") {
    apiFailure("BROADCAST_NOT_ACTIVE", "Yêu cầu này đã được xử lý", 409);
  }

  const now = new Date().toISOString();
  const expiresAt = nullableString(result.data.expires_at);
  if (expiresAt && expiresAt <= now) {
    const expired = await dbQuery<{ id: string }>(
      client
        .from("job_broadcasts")
        .update({ status: "expired", responded_at: now })
        .eq("id", result.data.id)
        .eq("status", "sent")
        .select("id")
        .maybeSingle(),
    );
    if (expired.error) {
      apiFailure("DB_ERROR", "Không thể cập nhật broadcast hết hạn", 500);
    }
    if (!expired.data) {
      apiFailure("BROADCAST_NOT_ACTIVE", "Yêu cầu này đã được xử lý", 409);
    }
    await logJobEvent(client, jobId, "broadcast_expired", ctx, null, null);
    apiFailure("EXPIRED", "Yêu cầu đã hết hạn", 410);
  }

  const update = await dbQuery<{ id: string }>(
    client
      .from("job_broadcasts")
      .update({ status: "declined", responded_at: now })
      .eq("id", result.data.id)
      .eq("status", "sent")
      .select("id")
      .maybeSingle(),
  );
  if (update.error) apiFailure("DB_ERROR", "Lỗi khi từ chối", 500);
  if (!update.data) {
    apiFailure("BROADCAST_NOT_ACTIVE", "Yêu cầu này đã được xử lý", 409);
  }
  await logJobEvent(client, jobId, "worker_declined", ctx, null, null);
  return { job_id: jobId, declined: true as const };
}

async function updateJobStatus(ctx: MobileApiContext, jobId: string, input: {
  status: Extract<
    JobStatus,
    | "worker_on_way"
    | "arrived"
    | "inspecting"
    | "repairing"
    | "completed_by_worker"
  >;
  completion_notes?: string;
  completion_photo_urls?: string[];
  final_price?: number;
}) {
  const client = db(ctx);
  const jobResult = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("id, status, worker_id").eq("id", jobId)
      .single(),
  );
  if (jobResult.error || !jobResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  const job = jobResult.data;
  if (job.worker_id !== ctx.user.id) {
    apiFailure(
      "AUTH_FORBIDDEN",
      "Bạn không có quyền thực hiện hành động này",
      403,
    );
  }
  if (job.status === "scope_change_pending") {
    apiFailure(
      "SCOPE_CHANGE_PENDING",
      "Không thể cập nhật trạng thái khi đang chờ xác nhận thay đổi phạm vi",
      409,
    );
  }
  const transition = validateTransition(job.status as JobStatus, input.status);
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: input.status };
  if (transition.timestampColumn) update[transition.timestampColumn] = now;
  if (input.status === "completed_by_worker") {
    update.final_price = input.final_price ?? null;
    update.completion_notes = input.completion_notes ?? null;
    update.completion_photo_urls = input.completion_photo_urls ?? [];
  }

  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update(update)
      .eq("id", jobId)
      .eq("worker_id", ctx.user.id)
      .eq("status", job.status)
      .select("id")
      .maybeSingle(),
  );
  if (updated.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  }
  if (!updated.data) {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  await logJobEvent(
    client,
    jobId,
    "worker_status_update",
    ctx,
    job.status as JobStatus,
    input.status,
  );
  return {
    job_id: jobId,
    from_status: job.status as JobStatus,
    to_status: input.status,
    updated_at: now,
  };
}

async function requestScopeChange(ctx: MobileApiContext, jobId: string, input: {
  new_description: string;
  new_price_min: number;
  new_price_max: number;
  reason: string;
}) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("request_scope_change_atomic", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
      p_new_description: input.new_description,
      p_new_price_min: input.new_price_min,
      p_new_price_max: input.new_price_max,
      p_reason: input.reason,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tạo yêu cầu thay đổi", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể tạo yêu cầu thay đổi", 500);
  if (!row.ok) mapScopeRequestError(nullableString(row.error_code));
  await logJobEvent(
    db(ctx),
    jobId,
    "worker_requested_scope_change",
    ctx,
    null,
    "scope_change_pending",
    {
      scope_change_id: row.scope_change_id,
    },
  );
  return {
    scope_change_id: asString(row.scope_change_id),
    job_id: jobId,
    status: row.scope_status as ScopeChangeStatus,
    created_at: asString(row.created_at_ts),
  };
}

async function decideScopeChange(
  ctx: MobileApiContext,
  scopeChangeId: string,
  input: { decision: "approve" | "reject" },
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("decide_scope_change_atomic", {
      p_scope_change_id: scopeChangeId,
      p_customer_id: ctx.user.id,
      p_decision: input.decision,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật quyết định", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể cập nhật quyết định", 500);
  if (!row.ok) mapScopeDecisionError(nullableString(row.error_code));

  await logJobEvent(
    db(ctx),
    asString(row.job_id_out),
    input.decision === "approve"
      ? "customer_approved_scope_change"
      : "customer_rejected_scope_change",
    ctx,
    "scope_change_pending",
    "repairing",
    { scope_change_id: scopeChangeId, decision: input.decision },
  );
  return {
    scope_change_id: scopeChangeId,
    job_id: asString(row.job_id_out),
    status: row.scope_status as ScopeChangeStatus,
    decided_at: asString(row.decided_at_ts),
  };
}

async function confirmCompletion(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const jobResult = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("id, status, customer_id, final_price").eq(
      "id",
      jobId,
    ).single(),
  );
  if (jobResult.error || !jobResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  const job = jobResult.data;
  if (job.customer_id !== ctx.user.id) {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  const transition = validateTransition(
    job.status as JobStatus,
    "confirmed_by_customer",
  );
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
  const finalPrice = nullableNumber(job.final_price);
  if (finalPrice === null || finalPrice <= 0) {
    apiFailure(
      "INVALID_STATUS",
      "Worker chưa nhập giá cuối cùng nên chưa thể xác nhận hoàn tất",
      409,
    );
  }

  const now = new Date().toISOString();
  const updated = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({ status: "confirmed_by_customer", confirmed_at: now })
      .eq("id", jobId)
      .eq("customer_id", ctx.user.id)
      .eq("status", job.status)
      .select("id")
      .maybeSingle(),
  );
  if (updated.error) {
    apiFailure("DB_ERROR", "Không thể xác nhận hoàn thành", 500);
  }
  if (!updated.data) {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  await logJobEvent(
    client,
    jobId,
    "customer_confirmed_completion",
    ctx,
    job.status as JobStatus,
    "confirmed_by_customer",
  );
  return {
    job_id: jobId,
    status: "confirmed_by_customer" as JobStatus,
    final_price: finalPrice,
  };
}

async function submitReview(ctx: MobileApiContext, jobId: string, input: {
  rating: number;
  tags?: string[];
  comment?: string;
}) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("submit_review_atomic", {
      p_job_id: jobId,
      p_customer_id: ctx.user.id,
      p_rating: input.rating,
      p_tags: input.tags ?? [],
      p_comment: input.comment ?? null,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể gửi đánh giá", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể gửi đánh giá", 500);
  if (!row.ok) mapReviewError(nullableString(row.error_code));

  await logJobEvent(
    db(ctx),
    jobId,
    "customer_reviewed",
    ctx,
    null,
    "reviewed",
    { rating: input.rating },
  );
  return {
    review_id: asString(row.review_id),
    job_id: jobId,
    status: row.job_status as JobStatus,
  };
}

async function registerWorker(
  ctx: MobileApiContext,
  input: WorkerRegisterInput,
) {
  const rateCheck = checkRateLimit(
    `worker_register:${ctx.user.id}`,
    AI_SESSION_LIMIT,
  );
  if (!rateCheck.allowed) {
    apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
  }

  const client = db(ctx);
  const profile = await dbQuery<Record<string, unknown>>(
    client.from("profiles").select("role").eq("id", ctx.user.id).single(),
  );
  if (profile.error || !profile.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy hồ sơ", 404);
  }
  if (profile.data.role !== "worker") {
    apiFailure("WRONG_ROLE", "Tài khoản này không phải tài khoản thợ", 403);
  }

  const existing = await dbQuery<Record<string, unknown>>(
    client.from("worker_profiles").select("verification_status, is_suspended")
      .eq(
        "id",
        ctx.user.id,
      ).maybeSingle(),
  );
  if (existing.error) apiFailure("DB_ERROR", "Không thể tải hồ sơ thợ", 500);
  if (
    existing.data &&
    (
      ["approved", "suspended"].includes(
        existing.data.verification_status as string,
      ) ||
      existing.data.is_suspended === true
    )
  ) {
    apiFailure(
      "ALREADY_FINALIZED",
      "Hồ sơ đã được duyệt hoặc bị khóa. Liên hệ hỗ trợ để cập nhật.",
      409,
    );
  }

  const now = new Date().toISOString();
  const districts = normalizeWorkerDistricts(input.districts);
  if (!districts) {
    apiFailure("VALIDATION", "Khu vực làm việc không hợp lệ", 400);
  }
  const upserted = await dbQuery<
    { id: string; verification_status: WorkerVerificationStatus }
  >(
    client
      .from("worker_profiles")
      .upsert({
        id: ctx.user.id,
        legal_name: input.legal_name,
        date_of_birth: input.date_of_birth,
        gender: input.gender ?? null,
        service_types: input.service_types,
        years_experience: input.years_experience,
        districts,
        cccd_front_url: input.cccd_front_url,
        cccd_back_url: input.cccd_back_url,
        selfie_url: input.selfie_url,
        bank_account: input.bank_account,
        bank_name: input.bank_name,
        verification_status: "submitted",
        is_approved: false,
        is_available: false,
        is_suspended: false,
        updated_at: now,
      })
      .select("id, verification_status")
      .single(),
  );
  if (upserted.error || !upserted.data) {
    apiFailure("DB_ERROR", "Không thể lưu hồ sơ", 500);
  }
  return {
    worker_id: upserted.data.id,
    verification_status: asWorkerVerificationStatus(
      upserted.data.verification_status,
    ),
    submitted_at: now,
  };
}

async function getWorkerProfile(ctx: MobileApiContext) {
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("worker_profiles")
      .select(
        "id, verification_status, is_available, is_approved, is_suspended, service_types, districts, years_experience, rating, total_jobs, legal_name, date_of_birth, gender, bank_account, bank_name, cccd_front_url, cccd_back_url, selfie_url",
      )
      .eq("id", ctx.user.id)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải hồ sơ", 500);
  if (!result.data) return blankWorkerProfile(ctx.user.id);
  const worker = result.data;
  return {
    id: asString(worker.id),
    verification_status: asWorkerVerificationStatus(worker.verification_status),
    is_available: Boolean(worker.is_available),
    is_approved: Boolean(worker.is_approved),
    is_suspended: Boolean(worker.is_suspended),
    service_types: asServiceTypeArray(worker.service_types),
    districts: asStringArray(worker.districts),
    years_experience: asNumber(worker.years_experience),
    rating: asNumber(worker.rating),
    total_jobs: asNumber(worker.total_jobs),
    legal_name: nullableString(worker.legal_name),
    date_of_birth: nullableString(worker.date_of_birth),
    gender: nullableString(worker.gender),
    bank_account_masked: maskBankAccount(nullableString(worker.bank_account)),
    bank_name: nullableString(worker.bank_name),
    has_cccd: Boolean(worker.cccd_front_url && worker.cccd_back_url),
    has_selfie: Boolean(worker.selfie_url),
  };
}

async function updateWorkerAvailability(
  ctx: MobileApiContext,
  input: { is_available: boolean },
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("set_worker_availability_atomic", {
      p_worker_id: ctx.user.id,
      p_is_available: input.is_available,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
  if (!row.ok) mapAvailabilityError(nullableString(row.error_code));

  return {
    worker_id: ctx.user.id,
    is_available: Boolean(row.is_available),
    updated_at: asString(row.updated_at_ts),
  };
}

async function listWorkerBroadcasts(ctx: MobileApiContext) {
  const now = new Date();
  const expired = await dbQuery(
    db(ctx)
      .from("job_broadcasts")
      .update({ status: "expired", responded_at: now.toISOString() })
      .eq("worker_id", ctx.user.id)
      .eq("status", "sent")
      .lte("expires_at", now.toISOString()),
  );
  if (expired.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật yêu cầu hết hạn", 500);
  }

  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx)
      .from("job_broadcasts")
      .select(
        "id, job_id, status, sent_at, expires_at, jobs(status, service_type, address_district, kael_problem_identified, kael_price_min, kael_price_max)",
      )
      .eq("worker_id", ctx.user.id)
      .eq("status", "sent")
      .gt("expires_at", now.toISOString())
      .order("sent_at", { ascending: false })
      .limit(20),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải yêu cầu", 500);
  return {
    broadcasts: (result.data ?? []).map((row) => {
      const job = relatedJob(row.jobs);
      if (!job || job.status !== "broadcasting") return null;
      const min = nullableNumber(job.kael_price_min);
      const max = nullableNumber(job.kael_price_max);
      return {
        broadcast_id: asString(row.id),
        job_id: asString(row.job_id),
        status: row.status as BroadcastStatus,
        service_type: job.service_type as ServiceType,
        problem_summary: nullableString(job.kael_problem_identified),
        district: nullableString(job.address_district),
        estimated_price_min: min,
        estimated_price_max: max,
        estimated_earning_min: min === null
          ? null
          : Math.round(min * (1 - PLATFORM_FEE_WORKER)),
        estimated_earning_max: max === null
          ? null
          : Math.round(max * (1 - PLATFORM_FEE_WORKER)),
        sent_at: nullableString(row.sent_at),
        expires_at: nullableString(row.expires_at),
        seconds_remaining: secondsRemaining(
          nullableString(row.expires_at),
          now,
        ),
      };
    }).filter((broadcast): broadcast is NonNullable<typeof broadcast> =>
      broadcast !== null
    ),
  };
}

async function listWorkerJobs(ctx: MobileApiContext) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx)
      .from("jobs")
      .select(
        "id, status, service_type, kael_problem_identified, address_building, address_unit, address_floor, address_district, final_price, created_at, matched_at, completed_at",
      )
      .eq("worker_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải danh sách công việc", 500);
  }
  return {
    jobs: (result.data ?? []).map((row) => {
      const finalPrice = nullableNumber(row.final_price);
      return {
        id: asString(row.id),
        status: row.status as JobStatus,
        service_type: row.service_type as ServiceType,
        problem_summary: nullableString(row.kael_problem_identified),
        address_building: nullableString(row.address_building),
        address_unit: nullableString(row.address_unit),
        address_floor: nullableString(row.address_floor),
        district: nullableString(row.address_district),
        final_price: finalPrice,
        estimated_earning: finalPrice
          ? Math.round(finalPrice * (1 - PLATFORM_FEE_WORKER))
          : null,
        created_at: asString(row.created_at),
        matched_at: nullableString(row.matched_at),
        completed_at: nullableString(row.completed_at),
      };
    }),
  };
}

async function getWorkerEarnings(
  ctx: MobileApiContext,
  range: { from?: string; to?: string },
) {
  let query = db(ctx)
    .from("jobs")
    .select("id, status, final_price, created_at")
    .eq("worker_id", ctx.user.id)
    .in("status", [
      "paid",
      "reviewed",
      "confirmed_by_customer",
      "payment_pending",
    ]);
  if (range.from) query = query.gte("created_at", range.from);
  if (range.to) query = query.lte("created_at", range.to);

  const result = await dbQuery<Array<Record<string, unknown>>>(query);
  if (result.error) {
    console.warn("mobile-api earnings query failed", {
      workerId: ctx.user.id,
      errorCode: result.error.code,
    });
    apiFailure("DB_ERROR", "Không thể tải thu nhập", 500);
  }
  const rows = result.data ?? [];
  let gross = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  for (const row of rows) {
    const price = nullableNumber(row.final_price) ?? 0;
    if (row.status === "paid") {
      gross += price;
      paidCount++;
    } else if (
      row.status === "confirmed_by_customer" ||
      row.status === "payment_pending" ||
      row.status === "reviewed"
    ) {
      pendingAmount += price;
      pendingCount++;
    }
  }
  const fee = Math.round(gross * PLATFORM_FEE_WORKER);
  return {
    worker_id: ctx.user.id,
    total_jobs_paid: paidCount,
    gross_earnings: gross,
    platform_fee_total: fee,
    net_earnings: gross - fee,
    pending_payment_count: pendingCount,
    pending_payment_amount: pendingAmount,
    from_date: range.from ?? null,
    to_date: range.to ?? null,
  };
}

async function createBroadcasts(
  client: DbClient,
  jobId: string,
  serviceType: ServiceType,
  district: string,
) {
  const eligibleResult = await queryEligibleWorkers(
    client,
    serviceType,
    district,
    5,
  );
  if (!eligibleResult.success) {
    return {
      success: false as const,
      reasonCode: "DB_ERROR" as const,
      reason: eligibleResult.reason,
    };
  }
  const eligible = eligibleResult.workers;
  if (eligible.length === 0) {
    return {
      success: false as const,
      reasonCode: "NO_WORKER" as const,
      reason: "Không tìm thấy thợ phù hợp đang online trong khu vực",
    };
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60_000);
  const batchId = crypto.randomUUID();
  const rows = eligible.map((worker) => ({
    job_id: jobId,
    worker_id: worker.id,
    status: "sent",
    broadcast_at: now.toISOString(),
    sent_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    batch_id: batchId,
  }));
  const result = await dbQuery(client.from("job_broadcasts").insert(rows));
  if (result.error) {
    return {
      success: false as const,
      reasonCode: "DB_ERROR" as const,
      reason: "Lỗi khi gửi yêu cầu đến thợ",
    };
  }
  return { success: true as const, batchId, broadcastCount: eligible.length };
}

async function expireStaleBroadcasts(
  client: DbClient,
  jobId: string,
  nowIso: string,
) {
  const result = await dbQuery(
    client
      .from("job_broadcasts")
      .update({ status: "expired", responded_at: nowIso })
      .eq("job_id", jobId)
      .eq("status", "sent")
      .lte("expires_at", nowIso),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật broadcast đã hết hạn", 500);
  }
}

async function hasActiveBroadcast(
  client: DbClient,
  jobId: string,
  nowIso: string,
): Promise<boolean> {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_broadcasts")
      .select("id, expires_at")
      .eq("job_id", jobId)
      .eq("status", "sent")
      .limit(20),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể kiểm tra broadcast hiện tại", 500);
  }
  return (result.data ?? []).some((row) => {
    const expiresAt = nullableString(row.expires_at);
    return !expiresAt || expiresAt > nowIso;
  });
}

async function acquireBroadcastRetryLease(
  client: DbClient,
  jobId: string,
  customerId: string,
  nowIso: string,
): Promise<boolean> {
  const guardIso = new Date(Date.parse(nowIso) - 1_000).toISOString();
  const result = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({ broadcast_at: nowIso, confirmed_search_at: nowIso })
      .eq("id", jobId)
      .eq("customer_id", customerId)
      .eq("status", "broadcasting")
      .or(`broadcast_at.is.null,broadcast_at.lte.${guardIso}`)
      .select("id")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể bắt đầu tìm thợ", 500);
  }
  return Boolean(result.data);
}

async function getJobBroadcastState(client: DbClient, jobId: string) {
  const now = new Date();
  const nowIso = now.toISOString();
  await expireStaleBroadcasts(client, jobId, nowIso);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("job_broadcasts")
      .select("id, expires_at")
      .eq("job_id", jobId)
      .eq("status", "sent")
      .limit(20),
  );
  if (result.error) {
    apiFailure(
      "DB_ERROR",
      "Không thể kiểm tra trạng thái broadcast",
      500,
    );
  }
  const active = (result.data ?? []).filter((row) => {
    const expiresAt = nullableString(row.expires_at);
    return !expiresAt || expiresAt > nowIso;
  });
  const seconds = active
    .map((row) => secondsRemaining(nullableString(row.expires_at), now))
    .filter((value): value is number => value !== null);
  return {
    active_count: active.length,
    seconds_remaining: seconds.length > 0 ? Math.max(...seconds) : 0,
  };
}

async function getCurrentScopeChange(client: DbClient, jobId: string) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("scope_change_requests")
      .select(
        "id, status, requested_description, reason, price_min, price_max, created_at",
      )
      .eq("job_id", jobId)
      .in("status", ["waiting_customer_decision", "reviewing_by_kael"])
      .order("created_at", { ascending: false })
      .limit(1),
  );
  if (result.error) {
    apiFailure(
      "DB_ERROR",
      "Không thể tải yêu cầu đổi phạm vi hiện tại",
      500,
    );
  }
  const row = result.data?.[0];
  if (!row) return null;
  return {
    id: asString(row.id),
    status: row.status as ScopeChangeStatus,
    requested_description: nullableString(row.requested_description),
    reason: nullableString(row.reason),
    price_min: nullableNumber(row.price_min),
    price_max: nullableNumber(row.price_max),
    created_at: nullableString(row.created_at),
  };
}

async function queryEligibleWorkers(
  client: DbClient,
  serviceType: ServiceType,
  district: string,
  limit: number,
) {
  const candidateLimit = Math.max(limit, DEFAULT_WORKER_CANDIDATE_POOL_SIZE);
  const districtCode = normalizeDistrict(district);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("worker_profiles")
      .select("id, rating, total_jobs, service_types, districts")
      .eq("is_approved", true)
      .eq("is_available", true)
      .eq("is_suspended", false)
      .contains("service_types", [serviceType])
      .or(`districts.cs.{${districtCode}},districts.cs.{hcmc_all}`)
      .order("rating", { ascending: false })
      .limit(candidateLimit),
  );
  if (result.error) {
    console.warn("mobile-api worker eligibility query failed", {
      serviceType,
      district: districtCode,
      errorCode: result.error.code,
    });
    return {
      success: false as const,
      reason: "Lỗi khi tìm thợ phù hợp",
    };
  }
  const candidates = result.data ?? [];
  const candidateIds = candidates
    .map((worker) => asString(worker.id))
    .filter(Boolean);
  if (candidateIds.length === 0) {
    return { success: true as const, workers: [] };
  }
  const activeJobs = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("jobs")
      .select("worker_id")
      .in("worker_id", candidateIds)
      .in("status", ACTIVE_WORKER_JOB_STATUSES)
      .limit(candidateIds.length),
  );
  if (activeJobs.error) {
    console.warn("mobile-api active worker job query failed", {
      serviceType,
      district: districtCode,
      errorCode: activeJobs.error.code,
    });
    return {
      success: false as const,
      reason: "Lỗi khi tìm thợ phù hợp",
    };
  }
  const busyWorkerIds = new Set(
    (activeJobs.data ?? [])
      .map((job) => asString(job.worker_id))
      .filter(Boolean),
  );
  return {
    success: true as const,
    workers: candidates
      .filter((worker) => !busyWorkerIds.has(asString(worker.id)))
      .slice(0, limit)
      .map((worker) => ({
        id: asString(worker.id),
      })),
  };
}

async function logJobEvent(
  client: DbClient,
  jobId: string,
  eventType: string,
  actor: MobileApiContext,
  fromStatus: JobStatus | null,
  toStatus: JobStatus | null,
  metadata: Record<string, unknown> = {},
) {
  await dbQuery(
    client.from("job_events").insert({
      job_id: jobId,
      actor_id: actor.user.id,
      actor_role: actor.role,
      event_type: eventType,
      from_status: fromStatus,
      to_status: toStatus,
      safe_metadata: metadata,
    }),
  ).catch(() => {
    console.warn("mobile-api job event log failed", { jobId, eventType });
  });
}

async function logApiCalls(
  client: DbClient,
  rows: Array<Record<string, unknown>>,
) {
  if (rows.length === 0) return;
  await dbQuery(client.from("api_logs").insert(rows)).catch(() => {
    console.warn("mobile-api api_logs batch insert failed", {
      count: rows.length,
    });
  });
}

function mapAcceptError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Yêu cầu này không dành cho bạn", 404);
  }
  if (errorCode === "BROADCAST_NOT_ACTIVE") {
    apiFailure(
      "BROADCAST_NOT_ACTIVE",
      "Yêu cầu này đã được xử lý hoặc đã hết hạn",
      409,
    );
  }
  if (errorCode === "EXPIRED") {
    apiFailure("EXPIRED", "Yêu cầu đã hết hạn", 410);
  }
  if (errorCode === "ALREADY_TAKEN") {
    apiFailure("ALREADY_TAKEN", "Yêu cầu đã được thợ khác nhận trước", 409);
  }
  if (errorCode === "WORKER_NOT_ELIGIBLE") {
    apiFailure(
      "WORKER_NOT_ELIGIBLE",
      "Tài khoản thợ chưa đủ điều kiện nhận việc",
      403,
    );
  }
  apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
}

function mapAvailabilityError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Vui lòng hoàn tất đăng ký trước", 404);
  }
  if (errorCode === "NOT_APPROVED") {
    apiFailure("NOT_APPROVED", "Hồ sơ thợ chưa sẵn sàng nhận việc", 403);
  }
  if (errorCode === "WORKER_BUSY") {
    apiFailure(
      "WORKER_BUSY",
      "Bạn đang có công việc chưa kết thúc nên chưa thể bật nhận việc",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể cập nhật trạng thái", 500);
}

function mapCancelError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Chỉ có thể hủy trước khi thợ nhận việc", 409);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể hủy yêu cầu", 500);
}

function mapScopeRequestError(errorCode: string | null): never {
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure(
      "AUTH_FORBIDDEN",
      "Bạn không có quyền thực hiện hành động này",
      403,
    );
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái yêu cầu không hợp lệ", 409);
  }
  if (errorCode === "INVALID_PRICE_RANGE") {
    apiFailure("VALIDATION", "Khoảng giá không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể tạo yêu cầu thay đổi", 500);
}

function mapScopeDecisionError(errorCode: string | null): never {
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu thay đổi", 404);
  }
  if (errorCode === "ALREADY_DECIDED") {
    apiFailure("ALREADY_DECIDED", "Yêu cầu này đã được xử lý", 409);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái yêu cầu không hợp lệ", 409);
  }
  if (errorCode === "INVALID_DECISION") {
    apiFailure("VALIDATION", "Quyết định không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể cập nhật quyết định", 500);
}

function mapReviewError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
  }
  if (errorCode === "ALREADY_REVIEWED") {
    apiFailure("ALREADY_REVIEWED", "Yêu cầu này đã được đánh giá", 409);
  }
  if (errorCode === "INVALID_RATING") {
    apiFailure("VALIDATION", "Đánh giá phải từ 1 đến 5 sao", 400);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Chưa thể đánh giá yêu cầu này", 409);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure(
      "STATUS_CHANGED",
      "Trạng thái đã thay đổi. Vui lòng tải lại và thử lại.",
      409,
    );
  }
  apiFailure("DB_ERROR", "Không thể gửi đánh giá", 500);
}

function assertJobOwnership(
  job: Record<string, unknown>,
  ctx: MobileApiContext,
) {
  if (ctx.role === "admin") return;
  if (ctx.role === "customer" && job.customer_id === ctx.user.id) return;
  if (ctx.role === "worker" && job.worker_id === ctx.user.id) return;
  apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu", 404);
}

function db(ctx: MobileApiContext): DbClient {
  return ctx.supabase as DbClient;
}

async function dbQuery<T = unknown>(
  promise: QueryLike,
  ms = 10_000,
): Promise<DbResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DB timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]) as DbResult<
      T
    >;
  } catch (error) {
    return {
      data: null,
      error: {
        code: error instanceof Error && error.message.startsWith("DB timeout")
          ? "DB_TIMEOUT"
          : "DB_QUERY_FAILED",
        message: error instanceof Error ? error.name : "query failed",
      },
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function secondsRemaining(expiresAt: string | null, now: Date): number | null {
  if (!expiresAt) return null;
  return Math.max(
    0,
    Math.round((new Date(expiresAt).getTime() - now.getTime()) / 1000),
  );
}

function maskBankAccount(account: string | null): string | null {
  if (!account || account.length < 4) return null;
  return `****${account.slice(-4)}`;
}

function blankWorkerProfile(workerId: string) {
  return {
    id: workerId,
    verification_status: "draft" as const,
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
  };
}

function normalizeWorkerDistricts(districts: string[]): string[] | null {
  const normalized: string[] = [];
  for (const district of districts) {
    const canonical = normalizeWorkerDistrict(district);
    if (!canonical) return null;
    normalized.push(canonical);
  }
  return Array.from(new Set(normalized));
}

function normalizeWorkerDistrict(district: string): string | null {
  const canonical = normalizeDistrict(district);
  if (canonical !== "hcmc_all") return canonical;

  const trimmed = district.trim().toLowerCase();
  if (
    trimmed === "hcmc_all" ||
    trimmed === HCMC_DISTRICTS.hcmc_all.toLowerCase()
  ) {
    return canonical;
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function positiveNumberFrom(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function toCatalogBaseline(row: Record<string, unknown>) {
  const priceMin = positiveNumberFrom(row.price_min);
  const priceMax = positiveNumberFrom(row.price_max);
  if (priceMin === null || priceMax === null || priceMax < priceMin) {
    apiFailure("DB_ERROR", "Bảng giá nền có dữ liệu không hợp lệ", 500);
  }
  const districtCode = asString(row.district_code);
  if (!isKnownDistrictCode(districtCode)) {
    apiFailure("DB_ERROR", "Bảng giá nền có khu vực không hợp lệ", 500);
  }
  return {
    complexity: asComplexity(row.complexity),
    district_code: districtCode,
    price_min: priceMin,
    price_max: priceMax,
  };
}

function uniqueCatalogBaseline<
  T extends {
    complexity: unknown;
    district_code: unknown;
    price_min: unknown;
    price_max: unknown;
  },
>(baseline: T, index: number, baselines: T[]) {
  const key = catalogBaselineKey(baseline);
  return baselines.findIndex((candidate) =>
    catalogBaselineKey(candidate) === key
  ) === index;
}

function catalogBaselineKey(baseline: {
  complexity: unknown;
  district_code: unknown;
  price_min: unknown;
  price_max: unknown;
}) {
  return `${baseline.complexity}:${baseline.district_code}:${baseline.price_min}:${baseline.price_max}`;
}

function isKnownDistrictCode(
  value: string,
): value is keyof typeof HCMC_DISTRICTS {
  return Object.prototype.hasOwnProperty.call(HCMC_DISTRICTS, value);
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function relatedJob(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return typeof value[0] === "object" && value[0] !== null
      ? value[0] as Record<string, unknown>
      : null;
  }
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function asServiceType(value: unknown): ServiceType {
  return value === "plumbing" ? "plumbing" : "electrical";
}

function asServiceTypeArray(value: unknown): ServiceType[] {
  return asStringArray(value).filter((item): item is ServiceType =>
    item === "electrical" || item === "plumbing"
  );
}

function asComplexity(value: unknown): ComplexityLevel {
  if (value === "small" || value === "medium" || value === "large") {
    return value;
  }
  return "medium";
}

function nullableComplexity(value: unknown): ComplexityLevel | null {
  if (value === null || value === undefined) return null;
  return asComplexity(value);
}

function asJobStatus(value: unknown): JobStatus {
  if (
    value === "draft" ||
    value === "analyzing" ||
    value === "estimate_ready" ||
    value === "awaiting_customer_confirm" ||
    value === "broadcasting" ||
    value === "worker_matched" ||
    value === "worker_on_way" ||
    value === "arrived" ||
    value === "inspecting" ||
    value === "repairing" ||
    value === "scope_change_pending" ||
    value === "completed_by_worker" ||
    value === "confirmed_by_customer" ||
    value === "payment_pending" ||
    value === "paid" ||
    value === "reviewed" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "draft";
}

function asWorkerVerificationStatus(value: unknown): WorkerVerificationStatus {
  if (
    value === "draft" ||
    value === "submitted" ||
    value === "under_review" ||
    value === "approved" ||
    value === "rejected" ||
    value === "suspended"
  ) {
    return value;
  }
  return "draft";
}
