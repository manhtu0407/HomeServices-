import type {
  BroadcastStatus,
  ComplexityLevel,
  JobStatus,
  MessageSender,
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
  type DevicePushTokenInput,
  type JobCreateInput,
  type JobMediaAttachInput,
  type JobMessageSendInput,
  type KaelChatCreateInput,
  type KaelChatTurnInput,
  type PlacesAutocompleteInput,
  sanitizeForLLM,
  type WorkerCancellationDecisionInput,
  type WorkerCancellationRequestInput,
  type WorkerRegisterInput,
} from "../../_shared/domain.ts";
import {
  apiFailure,
  type MobileApiContext,
  type PlacesAutocompleteResponse,
  type MobileApiServices,
} from "./router.ts";
import { validateTransition } from "./lifecycle.ts";
import { AI_SESSION_LIMIT, checkRateLimit } from "./rate-limit.ts";
import { requireJobAccess } from "./access.ts";
import { sendPushToUser, sendPushToUsers } from "./push.ts";
import {
  type EdgeAiSecrets,
  type PipelineResult,
  PRICE_DISCLAIMER,
  reviewScopeChange,
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

const JOB_CHAT_SEND_STATUSES: JobStatus[] = [
  "worker_matched",
  "worker_on_way",
  "arrived",
  "inspecting",
  "repairing",
  "scope_change_pending",
  "completed_by_worker",
  "confirmed_by_customer",
];

const JOB_DETAIL_SELECT =
  "id, status, service_type, description, problem_chips, photo_urls, address_building, address_unit, address_floor, address_district, scheduled_at, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max, kael_advisory, customer_id, worker_id, final_price, completion_notes, completion_photo_urls, created_at, matched_at, arrived_at, completed_at, confirmed_at, paid_at, reviewed_at";
const DEFAULT_WORKER_CANDIDATE_POOL_SIZE = 50;
const KAEL_CHAT_SOFT_COST_CAP_USD = 0.5;
const KAEL_CHAT_HARD_COST_CAP_USD = 1;
const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_MAPS_TIMEOUT_MS = 5_000;

type KaelChatStatus = "active" | "estimate_ready" | "confirmed" | "abandoned";
type KaelChatNextAction =
  | "await_input"
  | "ask_photo"
  | "ask_video"
  | "estimate_ready"
  | "unsupported"
  | "budget_exceeded"
  | "confirmed";
type KaelChatTurnRole = "customer" | "kael" | "system";
type KaelChatContentType =
  | "text"
  | "photo_request"
  | "video_request"
  | "photo_attached"
  | "video_attached"
  | "clarification"
  | "analysis"
  | "estimate"
  | "error";

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
  range(from: number, to: number): Chain;
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
    placesAutocomplete: (ctx, input) => placesAutocomplete(ctx, input, secrets),
    createJob: (ctx, input) => createJob(ctx, input, secrets),
    getJob,
    createKaelChat: (ctx, input) => createKaelChat(ctx, input, secrets),
    getKaelChat,
    sendKaelChatTurn: (ctx, sessionId, input) =>
      sendKaelChatTurn(ctx, sessionId, input, secrets),
    confirmKaelChat: (ctx, sessionId) => confirmKaelChat(ctx, sessionId, secrets),
    confirmSearch,
    cancelJob,
    acceptBroadcast,
    declineBroadcast,
    updateJobStatus,
    requestScopeChange: (ctx, jobId, input) =>
      requestScopeChange(ctx, jobId, input, secrets),
    requestWorkerCancellation,
    attachJobMedia,
    listJobMessages,
    sendJobMessage,
    decideWorkerCancellation,
    decideScopeChange,
    confirmCompletion,
    submitReview,
    registerWorker,
    getWorkerProfile,
    updateWorkerAvailability,
    listWorkerBroadcasts,
    listWorkerJobs,
    getWorkerEarnings,
    listNotifications,
    markNotificationRead,
    registerDevicePushToken,
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

async function placesAutocomplete(
  ctx: MobileApiContext,
  input: PlacesAutocompleteInput,
  secrets: EdgeAiSecrets,
): Promise<PlacesAutocompleteResponse> {
  void ctx;
  const apiKey = readGoogleMapsApiKey(secrets);
  if (!apiKey) return { suggestions: [], fallback_used: true };

  try {
    const response = await fetchJsonWithTimeout(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      },
      body: JSON.stringify({
        input: input.input,
        languageCode: "vi",
        regionCode: "VN",
        includedRegionCodes: ["vn"],
        sessionToken: input.session_token,
        locationBias: {
          rectangle: {
            low: { latitude: 10.65, longitude: 106.55 },
            high: { latitude: 10.91, longitude: 106.85 },
          },
        },
      }),
    });
    if (!response.ok) {
      console.warn("mobile-api places autocomplete failed", {
        status: response.status,
      });
      return { suggestions: [], fallback_used: true };
    }

    const body = await response.json().catch(() => ({})) as {
      suggestions?: Array<{
        placePrediction?: {
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }>;
    };
    const suggestions = (body.suggestions ?? [])
      .map((suggestion) => {
        const prediction = suggestion.placePrediction;
        const label = prediction?.text?.text?.trim() ?? "";
        const placeId = prediction?.placeId?.trim() ?? "";
        if (!label || !placeId) return null;
        return {
          place_id: placeId,
          label,
          main_text: prediction?.structuredFormat?.mainText?.text?.trim() ??
            label,
          secondary_text:
            prediction?.structuredFormat?.secondaryText?.text?.trim() ?? null,
        };
      })
      .filter((item): item is PlacesAutocompleteResponse["suggestions"][number] =>
        item !== null
      )
      .slice(0, 5);

    return { suggestions, fallback_used: false };
  } catch (error) {
    console.warn("mobile-api places autocomplete threw", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { suggestions: [], fallback_used: true };
  }
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
  await geocodeJobAddressForMatching(client, jobId, {
    addressLabel: input.address_building ?? null,
    district: canonicalDistrict,
  }, secrets);
  await logJobEvent(client, jobId, "job_created", ctx, null, "analyzing");

  let pipeline: PipelineResult;
  try {
    pipeline = await runKaelPipeline(
      {
        serviceType: input.service_type,
        problemChips: input.problem_chips,
        description: input.description,
        district: canonicalDistrict,
        photoUrls: input.photo_urls,
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

async function createKaelChat(
  ctx: MobileApiContext,
  input: KaelChatCreateInput,
  secrets: EdgeAiSecrets,
) {
  if (input.session_id) {
    if (!input.message) return getKaelChat(ctx, input.session_id);
    return sendKaelChatTurn(ctx, input.session_id, {
      message: input.message,
      problem_chips: input.problem_chips,
      photo_urls: input.photo_urls,
      address_label: input.address_label,
      address_district: input.address_district,
    }, secrets);
  }

  const rateCheck = checkRateLimit(
    `kael_chat:${ctx.user.id}`,
    AI_SESSION_LIMIT,
  );
  if (!rateCheck.allowed) {
    apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
  }

  const client = db(ctx);
  const metadata = compactMetadata({
    problem_chips: input.problem_chips,
    address_label: input.address_label ?? null,
    address_district: input.address_district ?? null,
    photo_urls: input.photo_urls,
  });
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .insert({
        customer_id: ctx.user.id,
        service_type: input.service_type,
        status: "active",
        safe_metadata: metadata,
      })
      .select(
        "id, job_id, customer_id, service_type, status, started_at, estimate_ready_at, total_turns, total_cost_usd, safe_metadata, created_at",
      )
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("DB_ERROR", "Không thể tạo phiên Kael", 500);
  }

  if (input.message) {
    await insertKaelTurn(client, {
      session_id: asString(sessionResult.data.id),
      turn_index: 1,
      role: "customer",
      content_type: "text",
      text_content: sanitizeForLLM(input.message),
      media_refs: input.photo_urls,
      safe_metadata: {},
    });
    await updateKaelSession(client, asString(sessionResult.data.id), {
      total_turns: 1,
      safe_metadata: metadata,
    });
    await advanceKaelChatEstimate(
      ctx,
      asString(sessionResult.data.id),
      {
        ...input,
        message: sanitizeForLLM(input.message),
      },
      secrets,
    );
  }

  return getKaelChat(ctx, asString(sessionResult.data.id));
}

async function getKaelChat(ctx: MobileApiContext, sessionId: string) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select(
        "id, job_id, customer_id, service_type, status, started_at, estimate_ready_at, total_turns, total_cost_usd, safe_metadata, created_at",
      )
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  assertKaelSessionOwnership(sessionResult.data, ctx);

  const turnsResult = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("kael_chat_turns")
      .select(
        "id, session_id, turn_index, role, content_type, text_content, media_refs, safe_metadata, created_at",
      )
      .eq("session_id", sessionId)
      .order("turn_index", { ascending: true }),
  );
  if (turnsResult.error) {
    apiFailure("DB_ERROR", "Không thể tải lịch sử Kael", 500);
  }

  const turns = (turnsResult.data ?? []).map(serializeKaelTurn);
  const latestEstimate = [...turns]
    .reverse()
    .find((turn) => turn.content_type === "estimate")?.estimate ?? null;

  return {
    session: serializeKaelSession(sessionResult.data, latestEstimate, turns),
    turns,
  };
}

async function sendKaelChatTurn(
  ctx: MobileApiContext,
  sessionId: string,
  input: KaelChatTurnInput,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select(
        "id, customer_id, service_type, status, total_turns, safe_metadata",
      )
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  const session = sessionResult.data;
  assertKaelSessionOwnership(session, ctx);
  const status = asKaelChatStatus(session.status);
  if (status === "confirmed" || status === "abandoned") {
    apiFailure("INVALID_STATUS", "Phiên Kael này không còn nhận tin nhắn", 409);
  }

  const previousTurns = asNumber(session.total_turns);
  const metadata = compactMetadata({
    ...asRecord(session.safe_metadata),
    problem_chips: input.problem_chips ??
      asStringArray(asRecord(session.safe_metadata).problem_chips),
    address_label: input.address_label ??
      nullableString(asRecord(session.safe_metadata).address_label),
    address_district: input.address_district ??
      nullableString(asRecord(session.safe_metadata).address_district),
    photo_urls: mergeLimitedRefs(
      asStringArray(asRecord(session.safe_metadata).photo_urls),
      input.photo_urls,
      5,
    ),
  });
  await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: previousTurns + 1,
    role: "customer",
    content_type: input.photo_urls.length > 0 ? "photo_attached" : "text",
    text_content: sanitizeForLLM(input.message),
    media_refs: input.photo_urls,
    safe_metadata: {},
  });
  await updateKaelSession(client, sessionId, {
    total_turns: previousTurns + 1,
    status: "active",
    safe_metadata: metadata,
  });

  await advanceKaelChatEstimate(ctx, sessionId, {
    service_type: asServiceType(session.service_type),
    message: sanitizeForLLM(input.message),
    problem_chips: asStringArray(metadata.problem_chips),
    photo_urls: asStringArray(metadata.photo_urls),
    address_district: nullableString(metadata.address_district) ?? undefined,
  }, secrets);

  return getKaelChat(ctx, sessionId);
}

async function confirmKaelChat(
  ctx: MobileApiContext,
  sessionId: string,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("confirm_kael_chat_atomic", {
      p_session_id: sessionId,
      p_customer_id: ctx.user.id,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
  if (!asBoolean(row.ok)) mapConfirmKaelChatError(nullableString(row.error_code));

  const jobId = asString(row.job_id);
  if (!jobId) apiFailure("DB_ERROR", "Phiên Kael chưa tạo được yêu cầu", 500);
  await geocodeConfirmedKaelJob(
    client,
    sessionId,
    jobId,
    nullableString(row.district_code),
    secrets,
  );
  const confirmed = await confirmSearch(ctx, jobId);
  return {
    session_id: sessionId,
    ...confirmed,
  };
}

async function advanceKaelChatEstimate(
  ctx: MobileApiContext,
  sessionId: string,
  input: Required<Pick<KaelChatCreateInput, "service_type">> & {
    message?: string;
    problem_chips?: string[];
    photo_urls?: string[];
    address_district?: string;
  },
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const currentCostUsd = await getKaelChatCostUsd(client, sessionId);
  if (currentCostUsd >= KAEL_CHAT_HARD_COST_CAP_USD) {
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "error",
      text:
        "Kael tạm dừng phân tích thêm cho phiên này để giữ ngân sách AI an toàn. Bạn có thể đặt thợ từ ước tính đã có hoặc tạo phiên mới nếu cần.",
      nextStatus: "active",
      metadata: {
        budget_exceeded: true,
        hard_cap_usd: KAEL_CHAT_HARD_COST_CAP_USD,
        total_cost_usd: currentCostUsd,
      },
    });
    return;
  }

  const district = normalizeServiceAreaDistrict(input.address_district);
  if (!district) {
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "clarification",
      text:
        "Bạn cho Kael biết quận ở TP.HCM để ước tính đúng khu vực và tìm thợ phù hợp.",
      nextStatus: "active",
    });
    return;
  }

  const message = sanitizeForLLM(input.message ?? "");
  const problemChips = input.problem_chips?.filter(Boolean) ?? [];
  if (message.length < 10 && problemChips.length === 0) {
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "clarification",
      text:
        "Bạn mô tả rõ hơn vấn đề đang gặp: vị trí, dấu hiệu và mức độ ảnh hưởng trong căn hộ.",
      nextStatus: "active",
    });
    return;
  }

  let pipeline: PipelineResult;
  try {
    pipeline = await runKaelPipeline(
      {
        serviceType: input.service_type,
        problemChips: problemChips.length > 0 ? problemChips : [input.service_type],
        description: message,
        district,
        photoUrls: input.photo_urls ?? [],
      },
      client,
      secrets,
    );
  } catch {
    await appendKaelSystemTurn(client, sessionId, {
      contentType: "error",
      text: "Kael chưa thể phân tích lúc này. Bạn thử gửi lại sau ít phút.",
      nextStatus: "active",
    });
    return;
  }

  if (!pipeline.success) {
    await appendKaelSystemTurn(client, sessionId, {
      contentType: pipeline.code === "UNSUPPORTED" ? "error" : "clarification",
      text: pipeline.code === "UNSUPPORTED"
        ? pipeline.error
        : "Kael chưa đủ dữ liệu an toàn để ước tính. Bạn mô tả thêm hoặc gửi ảnh rõ hơn.",
      nextStatus: "active",
    });
    return;
  }

  const costUsd = pipeline.stageLogs.reduce(
    (sum, stage) => sum + (stage.costUsd ?? 0),
    0,
  );
  const estimate = pipeline.estimate;
  await appendKaelSystemTurn(client, sessionId, {
    contentType: "estimate",
    text: formatKaelEstimateText(estimate),
    nextStatus: "estimate_ready",
    estimate,
    costUsd,
    metadata: {
      estimate,
      fallback_used: pipeline.fallbackUsed,
      service_problem_id: pipeline.serviceProblemId,
      photo_count: input.photo_urls?.length ?? 0,
      budget_soft_cap_reached:
        currentCostUsd + costUsd >= KAEL_CHAT_SOFT_COST_CAP_USD,
    },
  });
}

async function getKaelChatCostUsd(
  client: DbClient,
  sessionId: string,
): Promise<number> {
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, total_cost_usd")
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  return asNumber(sessionResult.data.total_cost_usd);
}

async function appendKaelSystemTurn(
  client: DbClient,
  sessionId: string,
  input: {
    contentType: "clarification" | "estimate" | "error";
    text: string;
    nextStatus: "active" | "estimate_ready";
    estimate?: unknown;
    costUsd?: number;
    metadata?: Record<string, unknown>;
  },
) {
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, total_turns, total_cost_usd")
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  const nextIndex = asNumber(sessionResult.data.total_turns) + 1;
  await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: nextIndex,
    role: "kael",
    content_type: input.contentType,
    text_content: input.text,
    media_refs: [],
    safe_metadata: input.metadata ?? {},
    cost_usd: input.costUsd ?? null,
  });
  const sessionUpdate: Record<string, unknown> = {
    total_turns: nextIndex,
    total_cost_usd: asNumber(sessionResult.data.total_cost_usd) +
      (input.costUsd ?? 0),
    status: input.nextStatus,
  };
  if (input.nextStatus === "estimate_ready") {
    sessionUpdate.estimate_ready_at = new Date().toISOString();
  }
  await updateKaelSession(client, sessionId, sessionUpdate);
}

async function insertKaelTurn(
  client: DbClient,
  value: Record<string, unknown>,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_turns")
      .insert(value)
      .select("id")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể lưu lượt chat Kael", 500);
  }
  return result.data;
}

async function updateKaelSession(
  client: DbClient,
  sessionId: string,
  value: Record<string, unknown>,
) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .update(value)
      .eq("id", sessionId)
      .select("id")
      .maybeSingle(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể cập nhật phiên Kael", 500);
  }
}

async function getJob(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select: JOB_DETAIL_SELECT,
  });
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
  let rollbackStatus: JobStatus | null = null;
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    select: "id, status, customer_id, worker_id, service_type, address_district",
  });

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
    rollbackStatus = job.status as JobStatus;

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
      if (rollbackStatus) {
        const rolledBack = await rollbackFailedBroadcastStart(
          client,
          jobId,
          ctx.user.id,
          rollbackStatus,
        );
        if (!rolledBack) {
          apiFailure(
            "DB_ERROR",
            "Không thể khôi phục yêu cầu sau lỗi gửi thợ",
            500,
          );
        }
        await logJobEvent(
          client,
          jobId,
          "broadcast_start_failed",
          ctx,
          "broadcasting",
          rollbackStatus,
          { reason: broadcast.reason },
        );
      }
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

async function rollbackFailedBroadcastStart(
  client: DbClient,
  jobId: string,
  customerId: string,
  previousStatus: JobStatus,
): Promise<boolean> {
  const result = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update({
        status: previousStatus,
        broadcast_at: null,
        confirmed_search_at: null,
      })
      .eq("id", jobId)
      .eq("customer_id", customerId)
      .eq("status", "broadcasting")
      .select("id")
      .maybeSingle(),
  );
  return !result.error && Boolean(result.data);
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
  const client = db(ctx);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("accept_broadcast_atomic", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Lỗi khi nhận yêu cầu", 500);
  if (!row.ok) {
    if (row.error_code === "EXPIRED") {
      await logJobEvent(client, jobId, "broadcast_expired", ctx, null, null, {
        reason: "EXPIRED via RPC",
      });
    }
    mapAcceptError(nullableString(row.error_code));
  }

  await logJobEvent(
    client,
    jobId,
    "worker_accepted",
    ctx,
    "broadcasting",
    "worker_matched",
  );
  await notifyCustomerWorkerMatched(client, jobId, ctx.user.id);
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
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
  });
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
  await notifyCustomerJobStatus(
    client,
    jobId,
    nullableString(job.customer_id),
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
}, secrets: EdgeAiSecrets) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
    select:
      "id, status, customer_id, worker_id, service_type, description, kael_problem_identified, kael_complexity, kael_price_min, kael_price_max",
  });
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("request_scope_change_atomic", {
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
    client,
    jobId,
    "worker_requested_scope_change",
    ctx,
    null,
    "scope_change_pending",
    {
      scope_change_id: row.scope_change_id,
    },
  );
  const scopeChangeId = asString(row.scope_change_id);
  await notifyCustomerScopeChangeRequested(
    client,
    jobId,
    nullableString(job.customer_id),
    scopeChangeId,
  );
  const review = await reviewScopeChange({
    serviceType: asServiceType(job.service_type),
    originalDescription: nullableString(job.description) ?? "",
    originalProblemSummary: nullableString(job.kael_problem_identified),
    originalComplexity: asComplexityOrNull(job.kael_complexity),
    originalPriceMin: nullableNumber(job.kael_price_min),
    originalPriceMax: nullableNumber(job.kael_price_max),
    requestedDescription: input.new_description,
    requestedPriceMin: input.new_price_min,
    requestedPriceMax: input.new_price_max,
    reason: input.reason,
  }, secrets);
  await logScopeChangeReviewApiCall(client, jobId, review);
  await saveScopeChangeKaelReview(client, scopeChangeId, review);
  return {
    scope_change_id: scopeChangeId,
    job_id: jobId,
    status: row.scope_status as ScopeChangeStatus,
    created_at: asString(row.created_at_ts),
  };
}

async function logScopeChangeReviewApiCall(
  client: DbClient,
  jobId: string,
  review: Record<string, unknown>,
) {
  const provider = nullableString(review.provider);
  const model = nullableString(review.model);
  if (!provider || !model) return;
  await logApiCalls(client, [{
    job_id: jobId,
    request_id: crypto.randomUUID(),
    provider,
    model,
    input_tokens: null,
    output_tokens: null,
    cost_usd: nullableNumber(review.cost_usd),
    latency_ms: nullableNumber(review.latency_ms) ?? 0,
    success: review.fallback_used !== true,
    error_code: nullableString(review.failure_reason),
  }]);
}

async function saveScopeChangeKaelReview(
  client: DbClient,
  scopeChangeId: string,
  review: Record<string, unknown>,
) {
  const result = await dbQuery<{ id: string }>(
    client
      .from("scope_change_requests")
      .update({ kael_review: review })
      .eq("id", scopeChangeId)
      .select("id")
      .maybeSingle(),
  );
  if (result.error || !result.data) {
    console.warn("mobile-api scope change Kael review save failed", {
      scopeChangeId,
      errorCode: result.error?.code ?? "NO_ROW",
    });
  }
}

async function requestWorkerCancellation(
  ctx: MobileApiContext,
  jobId: string,
  input: WorkerCancellationRequestInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "worker",
  });
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("request_worker_cancellation_atomic", {
      p_job_id: jobId,
      p_worker_id: ctx.user.id,
      p_reason: input.reason,
      p_evidence_photo_urls: input.evidence_photo_urls,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy việc", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy việc", 500);
  if (!row.ok) mapWorkerCancellationRequestError(nullableString(row.error_code));

  const cancellationId = asString(row.cancellation_id);
  const cancellationStatus = asString(row.cancellation_status);
  const jobStatus = row.job_status as JobStatus | undefined;
  let broadcastSent = false;
  let message = cancellationStatus === "approved"
    ? "Đã hủy việc và đang tìm thợ thay thế."
    : "Đã gửi yêu cầu hủy việc.";

  if (cancellationStatus === "approved") {
    const district = normalizeServiceAreaDistrict(nullableString(row.district_code) ?? "");
    if (district) {
      const previousRecipients = await listBroadcastRecipientWorkerIds(client, jobId);
      if (!previousRecipients.success) {
        message = previousRecipients.reason;
      } else {
        const cancelledWorkerId = nullableString(row.worker_id_out) ?? ctx.user.id;
        const excludeWorkerIds = Array.from(new Set([
          cancelledWorkerId,
          ...previousRecipients.workerIds,
        ]));
        const broadcast = await createBroadcasts(
          client,
          jobId,
          row.service_type_out as ServiceType,
          district,
          { excludeWorkerIds },
        );
        broadcastSent = broadcast.success;
        message = broadcast.success
          ? `Đã gửi yêu cầu đến ${broadcast.broadcastCount} thợ thay thế.`
          : broadcast.reason;
      }
    } else {
      message = "Đã hủy việc nhưng địa chỉ cần có quận TP.HCM rõ ràng để tìm thợ thay thế.";
    }
    await notifyCustomerWorkerReplacementSearch(
      client,
      jobId,
      nullableString(job.customer_id),
      broadcastSent,
    );
  }

  await logJobEvent(
    client,
    jobId,
    "worker_requested_cancellation",
    ctx,
    null,
    null,
    {
      cancellation_id: cancellationId,
      cancellation_status: cancellationStatus,
      broadcast_sent: broadcastSent,
    },
  );
  return {
    cancellation_id: cancellationId,
    job_id: jobId,
    status: cancellationStatus,
    job_status: jobStatus ?? (job.status as JobStatus),
    broadcast_sent: broadcastSent,
    message,
    created_at: asString(row.created_at_ts),
  };
}

async function attachJobMedia(
  ctx: MobileApiContext,
  jobId: string,
  input: JobMediaAttachInput,
) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select:
      "id, status, service_type, customer_id, worker_id, photo_urls, completion_photo_urls",
  });
  const status = job.status as JobStatus;
  const customerId = nullableString(job.customer_id);
  const workerId = nullableString(job.worker_id);
  const isCustomer = customerId === ctx.user.id;
  const isWorker = workerId === ctx.user.id;
  const isAdmin = ctx.role === "admin";
  if (!isCustomer && !isWorker && !isAdmin) {
    apiFailure("FORBIDDEN", "Bạn không có quyền gắn media cho yêu cầu này", 403);
  }

  const serviceType = asServiceType(job.service_type);
  const rows = input.assets.map((asset) => {
    validateJobMediaPath(jobId, asset.stage, asset.object_path);
    if (!canAttachJobMediaStage(asset.stage, isCustomer, isWorker, isAdmin)) {
      apiFailure("FORBIDDEN", "Vai trò hiện tại không được gắn media ở bước này", 403);
    }
    return {
      job_id: jobId,
      owner_id: ctx.user.id,
      service_type: serviceType,
      stage: asset.stage,
      bucket_id: "job-media",
      object_path: asset.object_path,
      mime_type: asset.mime_type ?? null,
      file_size_bytes: asset.file_size_bytes ?? null,
      safe_metadata: {},
    };
  });

  const inserted = await dbQuery(
    client.from("job_media_assets").insert(rows).select("id"),
  );
  if (inserted.error) {
    apiFailure("DB_ERROR", "Không thể lưu thông tin media", 500);
  }

  const beforeRefs = rows
    .filter((row) => row.stage === "before" || row.stage === "kael_reference")
    .map((row) => storageRef(row.object_path));
  const afterRefs = rows
    .filter((row) => row.stage === "after")
    .map((row) => storageRef(row.object_path));
  let photoUrls = asStringArray(job.photo_urls);

  if (beforeRefs.length > 0) {
    photoUrls = mergeLimitedRefs(photoUrls, beforeRefs, 5);
    const updated = await dbQuery(
      client
        .from("jobs")
        .update({ photo_urls: photoUrls })
        .eq("id", jobId)
        .select("id")
        .maybeSingle(),
    );
    if (updated.error || !updated.data) {
      apiFailure("DB_ERROR", "Không thể cập nhật media yêu cầu", 500);
    }
  }

  if (afterRefs.length > 0) {
    const completionPhotoUrls = mergeLimitedRefs(
      asStringArray(job.completion_photo_urls),
      afterRefs,
      10,
    );
    const updated = await dbQuery(
      client
        .from("jobs")
        .update({ completion_photo_urls: completionPhotoUrls })
        .eq("id", jobId)
        .select("id")
        .maybeSingle(),
    );
    if (updated.error || !updated.data) {
      apiFailure("DB_ERROR", "Không thể cập nhật media hoàn tất", 500);
    }
  }

  await logJobEvent(
    client,
    jobId,
    "job_media_attached",
    ctx,
    status,
    status,
    {
      count: rows.length,
      stages: Array.from(new Set(rows.map((row) => row.stage))),
    },
  );

  return {
    job_id: jobId,
    photo_urls: photoUrls,
    media: rows.map((row) => ({
      bucket_id: "job-media" as const,
      object_path: row.object_path,
      storage_ref: storageRef(row.object_path),
      stage: row.stage,
    })),
  };
}

async function listJobMessages(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  await requireJobAccess(client, jobId, ctx, {
    select: "id, status, customer_id, worker_id",
  });
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("chat_messages")
      .select("id, job_id, sender_id, sender_role, content, is_read, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(100),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải tin nhắn", 500);
  }
  await markJobMessagesRead(client, jobId, ctx.user.id);
  return {
    job_id: jobId,
    messages: (result.data ?? []).map(serializeJobMessage).reverse(),
  };
}

async function sendJobMessage(
  ctx: MobileApiContext,
  jobId: string,
  input: JobMessageSendInput,
) {
  if (ctx.role !== "customer" && ctx.role !== "worker") {
    apiFailure("AUTH_FORBIDDEN", "Bạn không có quyền gửi tin nhắn", 403);
  }
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    select: "id, status, customer_id, worker_id",
  });
  if (!JOB_CHAT_SEND_STATUSES.includes(job.status as JobStatus)) {
    apiFailure(
      "INVALID_STATUS",
      "Chưa thể gửi tin nhắn ở trạng thái yêu cầu hiện tại",
      409,
    );
  }
  const content = input.content.trim();
  if (!content) apiFailure("VALIDATION", "Nội dung tin nhắn không hợp lệ", 400);

  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("chat_messages")
      .insert({
        job_id: jobId,
        sender_id: ctx.user.id,
        sender_role: ctx.role,
        content,
      })
      .select("id, job_id, sender_id, sender_role, content, is_read, created_at")
      .single(),
  );
  if (result.error || !result.data) {
    apiFailure("DB_ERROR", "Không thể gửi tin nhắn", 500);
  }
  const message = serializeJobMessage(result.data);
  await notifyJobMessageRecipient(client, job, ctx, message.id);
  return { message };
}

async function markJobMessagesRead(
  client: DbClient,
  jobId: string,
  readerId: string,
) {
  const result = await dbQuery(
    client
      .from("chat_messages")
      .update({ is_read: true })
      .eq("job_id", jobId)
      .neq("sender_id", readerId)
      .eq("is_read", false)
      .select("id"),
  );
  if (result.error) {
    console.warn("mobile-api chat read update failed", {
      jobId,
      errorCode: result.error.code,
    });
  }
}

async function decideWorkerCancellation(
  ctx: MobileApiContext,
  cancellationId: string,
  input: WorkerCancellationDecisionInput,
): ReturnType<MobileApiServices["decideWorkerCancellation"]> {
  void ctx;
  void cancellationId;
  void input;
  apiFailure(
    "DEPRECATED",
    "Yêu cầu hủy việc của thợ đã được xử lý tự động ở endpoint hủy việc",
    410,
  );
  throw new Error("Unreachable after worker cancellation deprecation failure");
}

async function decideScopeChange(
  ctx: MobileApiContext,
  scopeChangeId: string,
  input: { decision: "approve" | "reject" },
) {
  const client = db(ctx);
  const nextJobStatus = scopeDecisionToJobStatus(input.decision);
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("decide_scope_change_atomic", {
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

  const jobId = asString(row.job_id_out);
  await logJobEvent(
    client,
    jobId,
    input.decision === "approve"
      ? "customer_approved_scope_change"
      : "customer_rejected_scope_change",
    ctx,
    "scope_change_pending",
    nextJobStatus,
    { scope_change_id: scopeChangeId, decision: input.decision },
  );
  await notifyWorkerScopeDecision(client, jobId, scopeChangeId, input.decision);
  return {
    scope_change_id: scopeChangeId,
    job_id: jobId,
    status: row.scope_status as ScopeChangeStatus,
    decided_at: asString(row.decided_at_ts),
  };
}

function scopeDecisionToJobStatus(decision: "approve" | "reject"): JobStatus {
  return decision === "approve" ? "repairing" : "cancelled";
}

async function confirmCompletion(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  const job = await requireJobAccess(client, jobId, ctx, {
    requiredRole: "customer",
    statuses: ["completed_by_worker"],
    select: "id, status, customer_id, worker_id, final_price",
  });
  const transition = validateTransition(
    job.status as JobStatus,
    "confirmed_by_customer",
  );
  if (!transition.valid) apiFailure("INVALID_STATUS", transition.error, 409);
  const finalPrice = nullableNumber(job.final_price);
  if (finalPrice === null || finalPrice <= 0) {
    apiFailure(
      "INVALID_STATUS",
      "Thợ chưa nhập giá cuối cùng nên chưa thể xác nhận hoàn tất",
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
  const client = db(ctx);
  await requireJobAccess(client, jobId, ctx, { requiredRole: "customer" });
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("submit_review_atomic", {
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
    client,
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
        home_lat: input.home_lat ?? null,
        home_lng: input.home_lng ?? null,
        service_radius_km: input.service_radius_km ?? 8,
        problem_specializations: input.problem_specializations ?? [],
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
        "id, verification_status, is_available, is_approved, is_suspended, service_types, districts, home_lat, home_lng, service_radius_km, problem_specializations, years_experience, rating, total_jobs, legal_name, date_of_birth, gender, bank_account, bank_name, cccd_front_url, cccd_back_url, selfie_url",
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
    home_lat: nullableNumber(worker.home_lat),
    home_lng: nullableNumber(worker.home_lng),
    service_radius_km: clampServiceRadius(worker.service_radius_km),
    problem_specializations: asStringArray(worker.problem_specializations),
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
    .select("id, status, final_price, paid_at, created_at")
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
    if (nullableString(row.paid_at)) {
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

async function listNotifications(ctx: MobileApiContext) {
  const unreadResult = await dbQuery<null>(
    db(ctx)
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.user.id)
      .neq("status", "read")
      .neq("status", "archived"),
  );
  if (unreadResult.error) {
    apiFailure("DB_ERROR", "Không thể tải số thông báo chưa đọc", 500);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx)
      .from("notifications")
      .select("id, title, body, event_type, status, job_id, created_at, read_at")
      .eq("user_id", ctx.user.id)
      .order("created_at", { ascending: false })
      .limit(30),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể tải thông báo", 500);
  }
  const notifications = (result.data ?? []).map((row) => ({
    id: asString(row.id),
    title: asString(row.title),
    body: asString(row.body),
    event_type: asString(row.event_type),
    status: asString(row.status),
    job_id: nullableString(row.job_id),
    created_at: asString(row.created_at),
    read_at: nullableString(row.read_at),
  }));
  return {
    unread_count: unreadResult.count ?? 0,
    notifications,
  };
}

async function markNotificationRead(
  ctx: MobileApiContext,
  notificationId: string,
) {
  const readAt = new Date().toISOString();
  const result = await dbQuery<Record<string, unknown>>(
    db(ctx)
      .from("notifications")
      .update({ status: "read", read_at: readAt })
      .eq("id", notificationId)
      .eq("user_id", ctx.user.id)
      .select("id, read_at")
      .maybeSingle(),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể cập nhật thông báo", 500);
  }
  if (!result.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy thông báo", 404);
  }
  return {
    notification_id: asString(result.data.id),
    status: "read" as const,
    read_at: nullableString(result.data.read_at) ?? readAt,
  };
}

async function registerDevicePushToken(
  ctx: MobileApiContext,
  input: DevicePushTokenInput,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("register_device_push_token_atomic", {
      p_user_id: ctx.user.id,
      p_platform: input.platform,
      p_push_token: input.push_token,
      p_permission_status: input.permission_status,
      p_safe_metadata: input.safe_metadata,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể lưu thiết bị nhận thông báo", 500);
  }
  const row = result.data?.[0];
  if (!row) {
    apiFailure("VALIDATION", "Dữ liệu thiết bị nhận thông báo không hợp lệ", 400);
  }
  return {
    token_id: asString(row.token_id),
    enabled: asBoolean(row.enabled_out),
    updated_at: asString(row.updated_at_ts),
  };
}

async function createBroadcasts(
  client: DbClient,
  jobId: string,
  serviceType: ServiceType,
  district: string,
  options: { excludeWorkerIds?: string[] } = {},
) {
  const eligibleResult = await queryEligibleWorkers(
    client,
    serviceType,
    district,
    5,
    { ...options, jobId },
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
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.from("job_broadcasts").insert(rows).select("id, worker_id"),
  );
  if (result.error) {
    return {
      success: false as const,
      reasonCode: "DB_ERROR" as const,
      reason: "Lỗi khi gửi yêu cầu đến thợ",
    };
  }
  const broadcastTargets = (result.data ?? []).map((row) => ({
    broadcastId: asString(row.id),
    workerId: asString(row.worker_id),
  })).filter((row) => row.broadcastId && row.workerId);
  await notifyBroadcastWorkers(
    client,
    jobId,
    serviceType,
    district,
    expiresAt.toISOString(),
    broadcastTargets,
  );
  return { success: true as const, batchId, broadcastCount: eligible.length };
}

async function notifyJobMessageRecipient(
  client: DbClient,
  job: Record<string, unknown>,
  ctx: MobileApiContext,
  messageId: string,
) {
  const recipientId = ctx.role === "customer"
    ? nullableString(job.worker_id)
    : nullableString(job.customer_id);
  if (!recipientId) return;

  const title = "Có tin nhắn mới";
  const body = "Bạn có tin nhắn mới trong công việc.";
  await insertUserNotification(client, {
    userId: recipientId,
    jobId: asString(job.id),
    eventType: "job_message_received",
    title,
    body,
    metadata: { message_id: messageId },
  });

  const jobId = asString(job.id);
  const deepLink = ctx.role === "customer"
    ? `/(worker)/jobs?job_id=${jobId}`
    : `/(customer)/history?job_id=${jobId}`;
  const push = await sendPushToUser(client, recipientId, {
    title,
    body,
    data: {
      event_type: "job_message_received",
      job_id: jobId,
      message_id: messageId,
      deep_link: deepLink,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api chat message push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

async function notifyBroadcastWorkers(
  client: DbClient,
  jobId: string,
  serviceType: ServiceType,
  district: string,
  expiresAt: string,
  targets: Array<{ workerId: string; broadcastId: string }>,
) {
  if (targets.length === 0) return;
  const body = `${serviceLabel(serviceType)} - ${districtLabel(district)}`;
  const notificationResults = await Promise.allSettled(
    targets.map((target) =>
      dbQuery<Array<Record<string, unknown>>>(
        client.rpc("insert_notification_atomic", {
          p_user_id: target.workerId,
          p_job_id: jobId,
          p_event_type: "broadcast_received",
          p_title: "Có yêu cầu mới",
          p_body: body,
          p_safe_metadata: {
            broadcast_id: target.broadcastId,
            expires_at: expiresAt,
          },
        }),
      )
    ),
  );
  notificationResults.forEach((result, index) => {
    if (result.status === "rejected" || result.value.error) {
      console.warn("mobile-api worker notification insert failed", {
        jobId,
        workerId: targets[index]?.workerId,
      });
    }
  });

  for (const target of targets) {
    const push = await sendPushToUser(client, target.workerId, {
      title: "Có yêu cầu mới gần bạn",
      body,
      data: {
        event_type: "broadcast_received",
        job_id: jobId,
        broadcast_id: target.broadcastId,
        deep_link: `/(worker)/jobs?broadcast_id=${target.broadcastId}`,
      },
      sound: "default",
    });
    if (push.failed > 0) {
      console.warn("mobile-api worker push delivery had failures", {
        jobId,
        workerId: target.workerId,
        failed: push.failed,
      });
    }
  }
}

async function notifyCustomerWorkerMatched(
  client: DbClient,
  jobId: string,
  workerId: string,
) {
  const customerLookup = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("customer_id").eq("id", jobId).single(),
  );
  if (customerLookup.error || !customerLookup.data) {
    console.warn("mobile-api customer notification lookup failed", { jobId });
    return;
  }
  const customerId = nullableString(customerLookup.data.customer_id);
  if (!customerId) return;

  const notification = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("insert_notification_atomic", {
      p_user_id: customerId,
      p_job_id: jobId,
      p_event_type: "worker_matched",
      p_title: "Đã có thợ nhận việc",
      p_body: "Thợ đang chuẩn bị, bạn có thể theo dõi trong Hoạt động.",
      p_safe_metadata: { worker_id: workerId },
    }),
  );
  if (notification.error) {
    console.warn("mobile-api customer notification insert failed", { jobId });
  }

  const push = await sendPushToUser(client, customerId, {
    title: "Đã có thợ nhận việc",
    body: "Thợ đang chuẩn bị đến.",
    data: {
      event_type: "worker_matched",
      job_id: jobId,
      deep_link: `/(customer)/history?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api customer push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

type NotificationCopy = {
  eventType: string;
  title: string;
  body: string;
};

const CUSTOMER_STATUS_PUSH: Partial<Record<JobStatus, NotificationCopy>> = {
  worker_on_way: {
    eventType: "worker_on_way",
    title: "Thợ đang đến",
    body: "Thợ đang di chuyển đến nơi hẹn.",
  },
  arrived: {
    eventType: "worker_arrived",
    title: "Thợ đã đến",
    body: "Thợ đã đến nơi và chuẩn bị kiểm tra.",
  },
  completed_by_worker: {
    eventType: "completed_by_worker",
    title: "Thợ đã báo hoàn tất",
    body: "Bạn có thể kiểm tra và xác nhận trong Hoạt động.",
  },
};

async function notifyCustomerJobStatus(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  status: JobStatus,
) {
  if (!customerId) return;
  const copy = CUSTOMER_STATUS_PUSH[status];
  if (!copy) return;

  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: copy.eventType,
    title: copy.title,
    body: copy.body,
    metadata: { status },
  });

  const push = await sendPushToUser(client, customerId, {
    title: copy.title,
    body: copy.body,
    data: {
      event_type: copy.eventType,
      job_id: jobId,
      deep_link: `/(customer)/history?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api customer status push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

async function notifyCustomerScopeChangeRequested(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  scopeChangeId: string,
) {
  if (!customerId || !scopeChangeId) return;
  const title = "Cần duyệt thay đổi phạm vi";
  const body = "Thợ vừa gửi thay đổi phạm vi. Vui lòng xem ngay.";
  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: "scope_change_requested",
    title,
    body,
    metadata: { scope_change_id: scopeChangeId },
  });

  const push = await sendPushToUser(client, customerId, {
    title,
    body,
    data: {
      event_type: "scope_change_requested",
      job_id: jobId,
      scope_change_id: scopeChangeId,
      deep_link: `/(customer)/history?scope_change=${scopeChangeId}&job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api scope-change customer push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

async function notifyCustomerWorkerReplacementSearch(
  client: DbClient,
  jobId: string,
  customerId: string | null,
  broadcastSent: boolean,
) {
  if (!customerId) return;
  const title = "Đang tìm thợ thay thế";
  const body = broadcastSent
    ? "Kael đã gửi yêu cầu đến thợ phù hợp khác."
    : "Kael đang tìm thợ phù hợp khác cho yêu cầu này.";
  await insertUserNotification(client, {
    userId: customerId,
    jobId,
    eventType: "worker_replacement_search",
    title,
    body,
    metadata: { broadcast_sent: broadcastSent },
  });

  const push = await sendPushToUser(client, customerId, {
    title,
    body,
    data: {
      event_type: "worker_replacement_search",
      job_id: jobId,
      deep_link: `/(customer)/history?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api replacement customer push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

async function notifyWorkerScopeDecision(
  client: DbClient,
  jobId: string,
  scopeChangeId: string,
  decision: "approve" | "reject",
) {
  if (!jobId || !scopeChangeId) return;
  const workerLookup = await dbQuery<Record<string, unknown>>(
    client.from("jobs").select("worker_id").eq("id", jobId).single(),
  );
  if (workerLookup.error || !workerLookup.data) {
    console.warn("mobile-api worker scope-decision lookup failed", { jobId });
    return;
  }
  const workerId = nullableString(workerLookup.data.worker_id);
  if (!workerId) return;

  const approved = decision === "approve";
  const eventType = approved
    ? "scope_change_approved"
    : "scope_change_rejected";
  const title = approved
    ? "Khách đã duyệt thay đổi"
    : "Khách đã từ chối thay đổi";
  const body = approved
    ? "Bạn có thể tiếp tục xử lý công việc."
    : "Công việc đã được hủy theo quyết định của khách.";
  await insertUserNotification(client, {
    userId: workerId,
    jobId,
    eventType,
    title,
    body,
    metadata: { scope_change_id: scopeChangeId, decision },
  });

  const push = await sendPushToUser(client, workerId, {
    title,
    body,
    data: {
      event_type: eventType,
      job_id: jobId,
      scope_change_id: scopeChangeId,
      deep_link: `/(worker)/jobs?job_id=${jobId}`,
    },
    sound: "default",
  });
  if (push.failed > 0) {
    console.warn("mobile-api worker scope-decision push delivery had failures", {
      jobId,
      failed: push.failed,
    });
  }
}

async function insertUserNotification(
  client: DbClient,
  input: {
    userId: string;
    jobId: string;
    eventType: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  },
) {
  const notification = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("insert_notification_atomic", {
      p_user_id: input.userId,
      p_job_id: input.jobId,
      p_event_type: input.eventType,
      p_title: input.title,
      p_body: input.body,
      p_safe_metadata: input.metadata ?? {},
    }),
  );
  if (notification.error) {
    console.warn("mobile-api notification insert failed", {
      jobId: input.jobId,
      eventType: input.eventType,
    });
  }
}

async function listBroadcastRecipientWorkerIds(client: DbClient, jobId: string) {
  const workerIds = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const result = await dbQuery<Array<Record<string, unknown>>>(
      client
        .from("job_broadcasts")
        .select("worker_id")
        .eq("job_id", jobId)
        .order("broadcast_at", { ascending: true })
        .range(from, from + pageSize - 1),
    );
    if (result.error) {
      return {
        success: false as const,
        reason: "Đã duyệt hủy nhưng không thể kiểm tra danh sách thợ đã nhận yêu cầu.",
      };
    }
    const rows = result.data ?? [];
    for (const row of rows) {
      const workerId = asString(row.worker_id);
      if (workerId) workerIds.add(workerId);
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return {
    success: true as const,
    workerIds: Array.from(workerIds),
  };
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
        "id, status, requested_description, reason, price_min, price_max, kael_review, created_at",
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
    kael_review: nullableRecord(row.kael_review),
    created_at: nullableString(row.created_at),
  };
}

async function queryEligibleWorkers(
  client: DbClient,
  serviceType: ServiceType,
  district: string,
  limit: number,
  options: { excludeWorkerIds?: string[]; jobId?: string } = {},
) {
  const candidateLimit = Math.max(limit, DEFAULT_WORKER_CANDIDATE_POOL_SIZE);
  const districtCode = normalizeDistrict(district);
  const excludedWorkerIds = new Set(options.excludeWorkerIds ?? []);
  const jobGeo = options.jobId
    ? await loadJobGeoForMatching(client, options.jobId)
    : null;
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client
      .from("worker_profiles")
      .select("id, rating, total_jobs, service_types, districts, home_lat, home_lng, service_radius_km, problem_specializations")
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
  const candidates = (result.data ?? []).filter((worker) =>
    !excludedWorkerIds.has(asString(worker.id))
  );
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
    workers: rankEligibleWorkers(
      candidates.filter((worker) => !busyWorkerIds.has(asString(worker.id))),
      jobGeo,
    )
      .slice(0, limit)
      .map((worker) => ({
        id: asString(worker.id),
      })),
  };
}

async function loadJobGeoForMatching(client: DbClient, jobId: string) {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("jobs")
      .select("address_lat, address_lng, problem_chips, service_problem_id, kael_problem_identified")
      .eq("id", jobId)
      .maybeSingle(),
  );
  if (result.error) {
    console.warn("mobile-api geo job lookup failed", {
      jobId,
      errorCode: result.error.code,
    });
    return null;
  }
  if (!result.data) return null;
  return {
    lat: nullableNumber(result.data.address_lat),
    lng: nullableNumber(result.data.address_lng),
    problemKeys: specializationKeys([
      ...asStringArray(result.data.problem_chips),
      nullableString(result.data.service_problem_id),
      nullableString(result.data.kael_problem_identified),
    ]),
  };
}

function rankEligibleWorkers(
  workers: Array<Record<string, unknown>>,
  jobGeo: Awaited<ReturnType<typeof loadJobGeoForMatching>>,
) {
  return workers
    .map((worker) => {
      const workerLat = nullableNumber(worker.home_lat);
      const workerLng = nullableNumber(worker.home_lng);
      const radius = clampServiceRadius(worker.service_radius_km);
      const distanceKm = jobGeo && jobGeo.lat !== null && jobGeo.lng !== null &&
          workerLat !== null && workerLng !== null
        ? distanceKmBetween(jobGeo.lat, jobGeo.lng, workerLat, workerLng)
        : null;
      const specializationMatch = hasSpecializationMatch(
        asStringArray(worker.problem_specializations),
        jobGeo?.problemKeys ?? new Set<string>(),
      );
      const rating = asNumber(worker.rating);
      const totalJobs = asNumber(worker.total_jobs);
      const distanceScore = distanceKm === null || distanceKm <= radius
        ? 0
        : -(distanceKm - radius) * 2;
      return {
        worker,
        rating,
        totalJobs,
        score: rating * 10 + (specializationMatch ? 20 : 0) + distanceScore,
      };
    })
    .sort((left, right) =>
      right.score - left.score ||
      right.rating - left.rating ||
      right.totalJobs - left.totalJobs
    )
    .map((entry) => entry.worker);
}

function distanceKmBetween(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hasSpecializationMatch(
  workerSpecializations: string[],
  jobProblemKeys: Set<string>,
) {
  if (jobProblemKeys.size === 0 || workerSpecializations.length === 0) return false;
  return workerSpecializations
    .map(normalizeSpecializationKey)
    .some((key) => key.length > 0 && jobProblemKeys.has(key));
}

function specializationKeys(values: Array<string | null>) {
  return new Set(
    values
      .map((value) => normalizeSpecializationKey(value ?? ""))
      .filter(Boolean),
  );
}

function normalizeSpecializationKey(value: string) {
  return value.trim().toLowerCase();
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

function mapConfirmKaelChatError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  if (errorCode === "INVALID_STATUS" || errorCode === "ALREADY_CONFIRMED") {
    apiFailure(
      "INVALID_STATUS",
      "Phiên Kael chưa sẵn sàng hoặc đã được xác nhận",
      409,
    );
  }
  if (errorCode === "MISSING_ESTIMATE") {
    apiFailure("INVALID_STATUS", "Kael chưa có ước tính để đặt thợ", 409);
  }
  if (errorCode === "NO_DISTRICT") {
    apiFailure("VALIDATION", "Địa chỉ cần có quận TP.HCM rõ ràng", 400);
  }
  apiFailure("DB_ERROR", "Không thể xác nhận phiên Kael", 500);
}

function serializeKaelTurn(row: Record<string, unknown>) {
  const metadata = asRecord(row.safe_metadata);
  return {
    id: asString(row.id),
    session_id: asString(row.session_id),
    turn_index: asNumber(row.turn_index),
    role: asKaelTurnRole(row.role),
    content_type: asKaelContentType(row.content_type),
    text_content: nullableString(row.text_content),
    media_refs: asStringArray(row.media_refs),
    estimate: serializeKaelEstimate(metadata.estimate),
    created_at: asString(row.created_at),
  };
}

function serializeKaelSession(
  row: Record<string, unknown>,
  estimate: ReturnType<typeof serializeKaelEstimate>,
  turns: Array<ReturnType<typeof serializeKaelTurn>>,
) {
  const status = asKaelChatStatus(row.status);
  const lastTurn = turns[turns.length - 1];
  const totalCostUsd = asNumber(row.total_cost_usd);
  return {
    id: asString(row.id),
    job_id: nullableString(row.job_id),
    customer_id: asString(row.customer_id),
    service_type: asServiceType(row.service_type),
    status,
    estimate,
    started_at: asString(row.started_at),
    estimate_ready_at: nullableString(row.estimate_ready_at),
    total_turns: asNumber(row.total_turns),
    total_cost_usd: totalCostUsd,
    next_action: kaelNextAction(status, lastTurn?.content_type, totalCostUsd),
  };
}

function serializeKaelEstimate(value: unknown) {
  const estimate = asRecord(value);
  if (Object.keys(estimate).length === 0) return null;
  return {
    service_type: asServiceType(estimate.service_type),
    problem_category: asString(estimate.problem_category),
    problem_summary: asString(estimate.problem_summary),
    complexity: asComplexity(estimate.complexity),
    price_min: asNumber(estimate.price_min),
    price_max: asNumber(estimate.price_max),
    confidence: asNumber(estimate.confidence),
    advisory: nullableString(estimate.advisory),
    disclaimer: nullableString(estimate.disclaimer) ?? PRICE_DISCLAIMER,
  };
}

function serializeJobMessage(row: Record<string, unknown>) {
  return {
    id: asString(row.id),
    job_id: asString(row.job_id),
    sender_id: nullableString(row.sender_id),
    sender_role: asMessageSender(row.sender_role),
    content: asString(row.content),
    is_read: asBoolean(row.is_read),
    created_at: asString(row.created_at),
  };
}

function kaelNextAction(
  status: KaelChatStatus,
  lastContentType: string | undefined,
  totalCostUsd: number,
): KaelChatNextAction {
  if (status === "confirmed") return "confirmed";
  if (totalCostUsd >= KAEL_CHAT_HARD_COST_CAP_USD) return "budget_exceeded";
  if (status === "estimate_ready") return "estimate_ready";
  if (lastContentType === "photo_request") return "ask_photo";
  if (lastContentType === "video_request") return "ask_video";
  if (lastContentType === "error") return "unsupported";
  return "await_input";
}

function asKaelTurnRole(value: unknown): KaelChatTurnRole {
  if (value === "customer" || value === "kael" || value === "system") {
    return value;
  }
  return "system";
}

function asKaelContentType(value: unknown): KaelChatContentType {
  if (
    value === "text" ||
    value === "photo_request" ||
    value === "video_request" ||
    value === "photo_attached" ||
    value === "video_attached" ||
    value === "clarification" ||
    value === "analysis" ||
    value === "estimate" ||
    value === "error"
  ) {
    return value;
  }
  return "text";
}

function compactMetadata(input: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      result[key] = value.filter((item) => typeof item === "string");
      continue;
    }
    result[key] = value;
  }
  return result;
}

function formatKaelEstimateText(estimate: {
  problem_summary: string;
  complexity: ComplexityLevel;
  price_min: number;
  price_max: number;
  advisory: string | null;
  disclaimer: string;
}) {
  const advisory = estimate.advisory ? ` Lưu ý: ${estimate.advisory}` : "";
  return `Kael đã có ước tính: ${estimate.problem_summary}. Mức độ ${estimate.complexity}, khoảng ${estimate.price_min.toLocaleString("vi-VN")}-${estimate.price_max.toLocaleString("vi-VN")} đ. ${estimate.disclaimer}${advisory}`;
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

function mapWorkerCancellationRequestError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy công việc phù hợp", 404);
  }
  if (errorCode === "INVALID_STATUS") {
    apiFailure("INVALID_STATUS", "Trạng thái công việc chưa thể yêu cầu hủy", 409);
  }
  if (errorCode === "ALREADY_REQUESTED") {
    apiFailure("ALREADY_REQUESTED", "Yêu cầu hủy đang chờ Kael/Admin duyệt", 409);
  }
  if (errorCode === "RATE_LIMITED") {
    apiFailure("RATE_LIMITED", "Thợ đã hủy quá nhiều lần trong 24 giờ", 429);
  }
  if (errorCode === "STATUS_CHANGED") {
    apiFailure("STATUS_CHANGED", "Công việc đã thay đổi, vui lòng tải lại", 409);
  }
  if (errorCode === "INVALID_REASON") {
    apiFailure("VALIDATION", "Cần lý do hủy rõ ràng", 400);
  }
  apiFailure("DB_ERROR", "Không thể gửi yêu cầu hủy việc", 500);
}

function mapWorkerCancellationDecisionError(errorCode: string | null): never {
  if (errorCode === "NOT_FOUND") {
    apiFailure("NOT_FOUND", "Không tìm thấy yêu cầu hủy", 404);
  }
  if (errorCode === "AUTH_FORBIDDEN") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được duyệt yêu cầu hủy", 403);
  }
  if (errorCode === "ALREADY_DECIDED") {
    apiFailure("ALREADY_DECIDED", "Yêu cầu hủy đã được xử lý", 409);
  }
  if (errorCode === "JOB_CHANGED") {
    apiFailure("STATUS_CHANGED", "Công việc đã thay đổi, vui lòng tải lại", 409);
  }
  if (errorCode === "JOB_NOT_CANCELLABLE") {
    apiFailure("STATUS_CHANGED", "Công việc đã qua giai đoạn có thể duyệt hủy", 409);
  }
  if (errorCode === "INVALID_DECISION") {
    apiFailure("VALIDATION", "Quyết định không hợp lệ", 400);
  }
  apiFailure("DB_ERROR", "Không thể xử lý yêu cầu hủy việc", 500);
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

function validateJobMediaPath(
  jobId: string,
  stage: JobMediaAttachInput["assets"][number]["stage"],
  objectPath: string,
) {
  const expectedPrefix = `${jobId}/${stage}/`;
  const safePathPattern =
    /^[0-9a-fA-F-]{36}\/(?:before|after|kael_reference|cancellation_evidence)\/[A-Za-z0-9._-]+$/;
  if (
    !objectPath.startsWith(expectedPrefix) ||
    objectPath.includes("..") ||
    objectPath.includes("//") ||
    !safePathPattern.test(objectPath)
  ) {
    apiFailure("VALIDATION", "Đường dẫn media không hợp lệ", 400);
  }
}

function canAttachJobMediaStage(
  stage: JobMediaAttachInput["assets"][number]["stage"],
  isCustomer: boolean,
  isWorker: boolean,
  isAdmin: boolean,
) {
  if (isAdmin) return true;
  if (stage === "before" || stage === "kael_reference") return isCustomer;
  return isWorker;
}

function storageRef(objectPath: string) {
  return `supabase://job-media/${objectPath}`;
}

function mergeLimitedRefs(existing: string[], incoming: string[], limit: number) {
  return Array.from(new Set([...existing, ...incoming])).slice(0, limit);
}

function serviceLabel(serviceType: ServiceType): string {
  if (serviceType === "electrical") return "Sửa điện";
  if (serviceType === "plumbing") return "Sửa nước";
  return "Vệ sinh";
}

function districtLabel(district: string): string {
  const slug = normalizeDistrict(district);
  return HCMC_DISTRICTS[slug] ?? HCMC_DISTRICTS.hcmc_all;
}

function assertKaelSessionOwnership(
  session: Record<string, unknown>,
  ctx: MobileApiContext,
) {
  if (ctx.role === "admin") return;
  if (session.customer_id === ctx.user.id) return;
  apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
}

async function geocodeConfirmedKaelJob(
  client: DbClient,
  sessionId: string,
  jobId: string,
  district: string | null,
  secrets: EdgeAiSecrets,
) {
  const session = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("safe_metadata")
      .eq("id", sessionId)
      .maybeSingle(),
  );
  if (session.error) {
    console.warn("mobile-api Kael geocode session lookup failed", {
      jobId,
      errorCode: session.error.code,
    });
    await markJobGeocodeFallback(client, jobId);
    return;
  }
  const metadata = asRecord(session.data?.safe_metadata);
  await geocodeJobAddressForMatching(client, jobId, {
    addressLabel: nullableString(metadata.address_label),
    district,
  }, secrets);
}

async function geocodeJobAddressForMatching(
  client: DbClient,
  jobId: string,
  input: { addressLabel: string | null; district: string | null },
  secrets: EdgeAiSecrets,
) {
  const district = normalizeServiceAreaDistrict(input.district);
  const address = buildGeocodingAddress(input.addressLabel, district);
  const fallbackUpdate = compactMetadata({
    address_building: input.addressLabel?.slice(0, 200) ?? null,
    geo_source: "fallback",
  });
  const apiKey = readGoogleMapsApiKey(secrets);
  if (!apiKey || !district || !address) {
    await updateJobGeo(client, jobId, fallbackUpdate);
    return;
  }

  try {
    const url =
      `${GOOGLE_GEOCODING_URL}?address=${encodeURIComponent(address)}&region=vn&language=vi&key=${encodeURIComponent(apiKey)}`;
    const response = await fetchJsonWithTimeout(url, { method: "GET" });
    if (!response.ok) {
      console.warn("mobile-api geocoding failed", {
        jobId,
        status: response.status,
      });
      await updateJobGeo(client, jobId, fallbackUpdate);
      return;
    }
    const body = await response.json().catch(() => ({})) as {
      status?: string;
      results?: Array<{
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
    };
    const location = body.results?.[0]?.geometry?.location;
    if (
      body.status !== "OK" ||
      typeof location?.lat !== "number" ||
      typeof location.lng !== "number"
    ) {
      await updateJobGeo(client, jobId, fallbackUpdate);
      return;
    }

    await updateJobGeo(client, jobId, {
      ...fallbackUpdate,
      address_lat: location.lat,
      address_lng: location.lng,
      geo_source: "google_maps",
    });
  } catch (error) {
    console.warn("mobile-api geocoding threw", {
      jobId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    await updateJobGeo(client, jobId, fallbackUpdate);
  }
}

function buildGeocodingAddress(
  addressLabel: string | null,
  district: string | null,
) {
  const parts = [
    addressLabel?.trim(),
    district ? districtLabel(district) : null,
    "Ho Chi Minh City",
    "Vietnam",
  ].filter((part): part is string => Boolean(part));
  return Array.from(new Set(parts)).join(", ");
}

async function markJobGeocodeFallback(client: DbClient, jobId: string) {
  await updateJobGeo(client, jobId, { geo_source: "fallback" });
}

async function updateJobGeo(
  client: DbClient,
  jobId: string,
  value: Record<string, unknown>,
) {
  const update = await dbQuery<{ id: string }>(
    client
      .from("jobs")
      .update(value)
      .eq("id", jobId)
      .select("id")
      .maybeSingle(),
  );
  if (update.error) {
    console.warn("mobile-api job geo update failed", {
      jobId,
      errorCode: update.error.code,
    });
  }
}

function readGoogleMapsApiKey(secrets: EdgeAiSecrets): string | null {
  if (secrets.googleMapsApiKey) return secrets.googleMapsApiKey;
  const denoGet = (globalThis as {
    Deno?: { env?: { get?: (name: string) => string | undefined } };
  }).Deno?.env?.get;
  return denoGet?.("GOOGLE_MAPS_API_KEY") ?? null; // Deno.env.get("GOOGLE_MAPS_API_KEY")
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_MAPS_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
    home_lat: null,
    home_lng: null,
    service_radius_km: 8,
    problem_specializations: [],
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

function clampServiceRadius(value: unknown): number {
  const radius = Math.round(asNumber(value) || 8);
  return Math.min(30, Math.max(1, radius));
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

function asBoolean(value: unknown): boolean {
  return value === true;
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nullableRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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
  if (value === "plumbing") return "plumbing";
  if (value === "cleaning") return "cleaning";
  return "electrical";
}

function asServiceTypeArray(value: unknown): ServiceType[] {
  return asStringArray(value).filter((item): item is ServiceType =>
    item === "electrical" || item === "plumbing" || item === "cleaning"
  );
}

function asMessageSender(value: unknown): MessageSender {
  if (value === "worker" || value === "kael") return value;
  return "customer";
}

function asComplexity(value: unknown): ComplexityLevel {
  if (value === "small" || value === "medium" || value === "large") {
    return value;
  }
  return "medium";
}

function asComplexityOrNull(value: unknown): ComplexityLevel | null {
  return value === "small" || value === "medium" || value === "large"
    ? value
    : null;
}

function asKaelChatStatus(value: unknown): KaelChatStatus {
  if (
    value === "active" ||
    value === "estimate_ready" ||
    value === "confirmed" ||
    value === "abandoned"
  ) {
    return value;
  }
  return "active";
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
