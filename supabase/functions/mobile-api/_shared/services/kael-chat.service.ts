// Edge service kael-chat domain (C4 6a, services/* split): the customer Kael AI-conversation API —
// session create/turn + progress reads. The turn/estimate/boundary/demanding engine lives in
// kael-chat-core.ts. The streaming wrappers + confirm bridge stay in services.ts (import one-way).

import { asBoolean, asNumber, asRecord, asString, asStringArray, asKaelChatStatus, asServiceType, nullableString } from "./coercions.ts";
import { db, dbQuery } from "./db.ts";
import { compactMetadata, mergeLimitedRefs, parseKaelProgressSnapshot, serializeKaelSession, serializeKaelTurn } from "./_shared.ts";
import { mergeApartmentAccessProfiles, sanitizeApartmentAccessProfile } from "./apartment-access.service.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { checkKaelChatRateLimit } from "../rate-limit.ts";
import { scrubSensitiveForLLM, type EdgeAiSecrets } from "../kael/index.ts";
import {
  sanitizeForLLM,
  type KaelChatCreateInput,
  type KaelChatEvidenceInput,
  type KaelChatMediaUploadInput,
  type KaelChatTurnInput,
} from "../../../_shared/domain.ts";
import { advanceKaelChatEstimate, assertKaelSessionOwnership, findExistingKaelSessionByClientRequest, insertKaelTurn, maybeApplyKaelBoundaryGuard, maybeHandleDemandingCustomerKaelChatTurn, updateKaelSession } from "./kael-chat-core.ts";

type SignedUploadStorage = {
  storage?: {
    from(bucket: string): {
      createSignedUploadUrl(
        path: string,
      ): Promise<{
        data: { signedUrl?: string; signed_url?: string; token?: string } | null;
        error: unknown;
      }>;
    };
  };
};

const KAEL_CHAT_MEDIA_BUCKET = "kael-chat-media" as const;
const KAEL_CHAT_MEDIA_UPLOAD_EXPIRES_IN_SECONDS = 60 * 60;
const KAEL_CHAT_ALLOWED_MIME_TYPES = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);



export async function createKaelChat(
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
      apartment_access_profile: input.apartment_access_profile,
    }, secrets);
  }

  const client = db(ctx);

  // Idempotent re-POST runs BEFORE the
  // rate limiter so harmless retries with the same client_request_id do not
  // burn the user's per-minute quota. Closes F-04 for Kael chat.
  if (input.client_request_id) {
    const existingSession = await findExistingKaelSessionByClientRequest(
      client,
      ctx.user.id,
      input.client_request_id,
    );
    if (existingSession?.kind === "ready") {
      return getKaelChat(ctx, existingSession.sessionId);
    }
    if (existingSession?.kind === "pending") {
      apiFailure(
        "SESSION_PENDING",
        "Phiên Kael đang được tạo. Vui lòng thử lại sau.",
        409,
      );
    }
  }

  // DB-backed rate limit (5/min, 20/hour
  // per user). The in-process token bucket would not survive Edge worker
  // churn, so we delegate to a security-definer RPC. Closes F-23.
  const rate = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("check_kael_chat_rate", { p_user_id: ctx.user.id }),
  );
  if (!rate.error) {
    const row = rate.data?.[0];
    if (row && asBoolean(row.allowed) === false) {
      const reason = nullableString(row.reason);
      console.warn("kael_chat rate limited", {
        userId: ctx.user.id,
        reason,
        minute_count: row.minute_count,
        hour_count: row.hour_count,
      });
      apiFailure(
        "RATE_LIMITED",
        reason === "hour"
          ? "Bạn đã đạt giới hạn 20 phiên Kael trong 1 giờ. Vui lòng thử lại sau."
          : "Bạn đang gửi quá nhanh. Vui lòng thử lại sau ít phút.",
        429,
      );
    }
  } else {
    // Don't fail the request if the limiter itself broke — log + fall back to
    // the in-process best-effort bucket so we still rate limit warm workers.
    console.warn("kael_chat DB rate limit fallback", {
      errorCode: rate.error.code,
    });
    const fallback = checkKaelChatRateLimit(ctx.user.id);
    if (!fallback.allowed) {
      apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
    }
  }

  const metadata = compactMetadata({
    problem_chips: input.problem_chips,
    address_label: input.address_label ?? null,
    address_district: input.address_district ?? null,
    apartment_access_profile: sanitizeApartmentAccessProfile(
      input.apartment_access_profile,
    ),
    photo_urls: input.photo_urls,
    demanding_customer_qa_count: input.message ? 1 : undefined,
  });
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .insert({
        customer_id: ctx.user.id,
        service_type: input.service_type,
        status: "active",
        safe_metadata: metadata,
        client_request_id: input.client_request_id ?? null,
      })
      .select(
        "id, job_id, customer_id, service_type, status, started_at, estimate_ready_at, total_turns, total_cost_usd, safe_metadata, created_at",
      )
      .single(),
  );
  // Lost race against a concurrent create with the same client_request_id ->
  // fall back to the winner instead of bubbling 23505 to the mobile client.
  if (
    sessionResult.error?.code === "23505" && input.client_request_id
  ) {
    const recovered = await findExistingKaelSessionByClientRequest(
      client,
      ctx.user.id,
      input.client_request_id,
    );
    if (recovered?.kind === "ready") return getKaelChat(ctx, recovered.sessionId);
    if (recovered?.kind === "pending") {
      apiFailure(
        "SESSION_PENDING",
        "Phiên Kael đang được tạo. Vui lòng thử lại sau.",
        409,
      );
    }
  }
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("DB_ERROR", "Không thể tạo phiên Kael", 500);
  }

  if (input.message) {
    const message = sanitizeForLLM(input.message);
    const sessionId = asString(sessionResult.data.id);
    // Scrub PII (phone/CCCD/address/
    // building/unit) BEFORE persisting to kael_chat_turns.text_content so raw
    // PII never lands in the DB. The in-memory `message` (also sanitized) is
    // still used for boundary detection + analysis; the pipeline scrubs again
    // before any LLM call.
    await insertKaelTurn(client, {
      session_id: sessionId,
      turn_index: 1,
      role: "customer",
      content_type: "text",
      text_content: scrubSensitiveForLLM(message),
      media_refs: input.photo_urls,
      safe_metadata: {},
    });
    await updateKaelSession(client, sessionId, {
      total_turns: 1,
      safe_metadata: metadata,
    });
    // Apply boundary guard FIRST so
    // out-of-scope / injection / mismatch messages are declined before the
    // demanding-customer empathy path can intercept and produce a
    // misleading "wait_time_concern" style reply.
    const boundaryHandled = await maybeApplyKaelBoundaryGuard(
      client,
      sessionId,
      message,
      input.service_type,
      { actorId: ctx.user.id, jobId: null },
    );
    if (!boundaryHandled) {
      const handledDemandingCustomer =
        await maybeHandleDemandingCustomerKaelChatTurn(
          client,
          {
            sessionId,
            actorId: ctx.user.id,
            jobId: null,
            status: "active",
            metadata,
            message,
            qaCount: 1,
          },
        );
      if (!handledDemandingCustomer) {
        await advanceKaelChatEstimate(
          ctx,
          sessionId,
          {
            ...input,
            message,
          },
          secrets,
        );
      }
    }
  }

  return getKaelChat(ctx, asString(sessionResult.data.id));
}

export async function createKaelChatMediaUpload(
  ctx: MobileApiContext,
  input: KaelChatMediaUploadInput,
) {
  const mimeType = input.mime_type.trim().toLowerCase();
  if (!KAEL_CHAT_ALLOWED_MIME_TYPES.has(mimeType)) {
    apiFailure("UNSUPPORTED_MEDIA", "Định dạng media chưa được hỗ trợ", 400);
  }
  const storage = (ctx.supabase as SignedUploadStorage).storage;
  if (!storage) {
    apiFailure("STORAGE_NOT_CONFIGURED", "Kho media chưa được cấu hình", 500);
  }

  const objectName = safeKaelChatObjectName(input.file_name, mimeType);
  const objectPath = `${ctx.user.id}/kael-chat/${crypto.randomUUID()}-${objectName}`;
  const signed = await storage
    .from(KAEL_CHAT_MEDIA_BUCKET)
    .createSignedUploadUrl(objectPath);
  const signedUrl = signed.data?.signedUrl ?? signed.data?.signed_url;
  const token = signed.data?.token;
  if (signed.error || !signedUrl || !token) {
    apiFailure("STORAGE_ERROR", "Không thể chuẩn bị media cho Kael", 500);
  }

  return {
    bucket_id: KAEL_CHAT_MEDIA_BUCKET,
    object_path: objectPath,
    media_ref: `supabase://${KAEL_CHAT_MEDIA_BUCKET}/${objectPath}`,
    token,
    signed_upload_url: signedUrl,
    expires_in_seconds: KAEL_CHAT_MEDIA_UPLOAD_EXPIRES_IN_SECONDS,
  };
}

export async function getKaelChat(ctx: MobileApiContext, sessionId: string) {
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

export async function getKaelChatProgress(
  ctx: MobileApiContext,
  sessionId: string,
) {
  return readKaelChatProgressSnapshot(ctx, sessionId);
}

export async function sendKaelChatTurn(
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
        "id, job_id, customer_id, service_type, status, total_turns, safe_metadata",
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
  if (
    status === "confirmed" || status === "abandoned" ||
    status === "unsupported"
  ) {
    apiFailure("INVALID_STATUS", "Phiên Kael này không còn nhận tin nhắn", 409);
  }

  const previousTurns = asNumber(session.total_turns);
  const previousMetadata = asRecord(session.safe_metadata);
  const qaCount = asNumber(previousMetadata.demanding_customer_qa_count) + 1;
  const metadata = compactMetadata({
    ...previousMetadata,
    problem_chips: input.problem_chips ??
      asStringArray(previousMetadata.problem_chips),
    address_label: input.address_label ??
      nullableString(previousMetadata.address_label),
    address_district: input.address_district ??
      nullableString(previousMetadata.address_district),
    apartment_access_profile: mergeApartmentAccessProfiles(
      previousMetadata.apartment_access_profile,
      input.apartment_access_profile,
    ),
    photo_urls: mergeLimitedRefs(
      asStringArray(previousMetadata.photo_urls),
      input.photo_urls,
      5,
    ),
    demanding_customer_qa_count: qaCount,
  });
  const message = sanitizeForLLM(input.message);
  // Scrub PII before persisting.
  await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: previousTurns + 1,
    role: "customer",
    content_type: input.photo_urls.length > 0 ? "photo_attached" : "text",
    text_content: scrubSensitiveForLLM(message),
    media_refs: input.photo_urls,
    safe_metadata: {},
  });
  await updateKaelSession(client, sessionId, {
    total_turns: previousTurns + 1,
    status: "active",
    safe_metadata: metadata,
  });

  // Boundary guard BEFORE demanding-customer
  // intercept, otherwise off-topic / injection / mismatch messages could
  // bypass decline via empathy template.
  const boundaryHandled = await maybeApplyKaelBoundaryGuard(
    client,
    sessionId,
    message,
    asServiceType(session.service_type),
    { actorId: ctx.user.id, jobId: nullableString(session.job_id) },
  );
  if (boundaryHandled) return getKaelChat(ctx, sessionId);

  const handledDemandingCustomer = await maybeHandleDemandingCustomerKaelChatTurn(
    client,
    {
      sessionId,
      actorId: ctx.user.id,
      jobId: nullableString(session.job_id),
      status,
      metadata,
      message,
      qaCount,
    },
  );
  if (handledDemandingCustomer) return getKaelChat(ctx, sessionId);

  await advanceKaelChatEstimate(ctx, sessionId, {
    service_type: asServiceType(session.service_type),
    message,
    problem_chips: asStringArray(metadata.problem_chips),
    photo_urls: asStringArray(metadata.photo_urls),
    address_district: nullableString(metadata.address_district) ?? undefined,
  }, secrets);

  return getKaelChat(ctx, sessionId);
}

export async function submitKaelChatEvidence(
  ctx: MobileApiContext,
  sessionId: string,
  input: KaelChatEvidenceInput,
) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select(
        "id, job_id, customer_id, service_type, status, total_turns, safe_metadata",
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
  if (
    status === "confirmed" ||
    status === "abandoned" ||
    status === "unsupported"
  ) {
    apiFailure("INVALID_STATUS", "Phiên Kael này không còn nhận bằng chứng", 409);
  }

  const evidenceRefs = validateKaelChatEvidenceMediaRefs(
    input.media_refs,
    asString(session.customer_id),
  );
  if (input.decision === "confirmed" && evidenceRefs.length === 0) {
    apiFailure("VALIDATION", "Cần ít nhất một media bằng chứng", 400);
  }

  const previousMetadata = asRecord(session.safe_metadata);
  const previousTurns = asNumber(session.total_turns);
  const message = sanitizeForLLM(
    input.message ??
      input.skip_reason ??
      (input.decision === "confirmed" ? "Đã gửi bằng chứng." : "Bỏ qua bằng chứng."),
  );
  await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: previousTurns + 1,
    role: "customer",
    content_type: evidenceRefs.length > 0 ? "photo_attached" : "text",
    text_content: scrubSensitiveForLLM(message),
    media_refs: evidenceRefs,
    safe_metadata: compactMetadata({
      evidence_decision: input.decision,
      skip_reason: input.skip_reason ?? null,
    }),
  });

  const now = new Date().toISOString();
  await updateKaelSession(client, sessionId, {
    total_turns: previousTurns + 1,
    status: input.decision === "confirmed" ? "collecting_evidence" : "active",
    safe_metadata: compactMetadata({
      ...previousMetadata,
      evidence_decision: input.decision,
      evidence_media_refs: mergeLimitedRefs(
        asStringArray(previousMetadata.evidence_media_refs),
        evidenceRefs,
        5,
      ),
      evidence_updated_at: now,
      problem_chips: input.problem_chips ??
        asStringArray(previousMetadata.problem_chips),
      skip_reason: input.skip_reason ?? nullableString(previousMetadata.skip_reason),
    }),
  });

  return getKaelChat(ctx, sessionId);
}

export async function readKaelChatProgressSnapshot(
  ctx: MobileApiContext,
  sessionId: string,
) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, customer_id, kael_progress")
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }
  assertKaelSessionOwnership(sessionResult.data, ctx);

  return {
    session_id: sessionId,
    progress: parseKaelProgressSnapshot(sessionResult.data.kael_progress, sessionId),
  };
}

function safeKaelChatObjectName(fileName: string | undefined, mimeType: string) {
  const extension = extensionForKaelChatMime(mimeType);
  const rawName = (fileName?.trim() || `evidence.${extension}`)
    .split(/[\\/]/)
    .pop() ?? `evidence.${extension}`;
  const withoutQuery = rawName.split(/[?#]/)[0] ?? `evidence.${extension}`;
  const safeName = withoutQuery
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 140);
  const fallback = `evidence.${extension}`;
  const normalized = safeName || fallback;
  return /\.[A-Za-z0-9]{2,5}$/.test(normalized)
    ? normalized
    : `${normalized}.${extension}`;
}

function extensionForKaelChatMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/heic") return "heic";
  if (mimeType === "image/heif") return "heif";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "video/quicktime") return "mov";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav") return "wav";
  if (mimeType === "audio/aac") return "aac";
  if (mimeType === "audio/webm") return "webm";
  return "jpg";
}

const KAEL_CHAT_MEDIA_REF_PATTERN =
  /^supabase:\/\/kael-chat-media\/([^/\s?#]+)\/kael-chat\/(?!.*(?:\.\.|\/\/))[^\s?#]+$/i;

function validateKaelChatEvidenceMediaRefs(
  mediaRefs: string[],
  sessionOwnerId: string,
) {
  const normalizedRefs = mergeLimitedRefs(
    [],
    mediaRefs.map((ref) => ref.trim()).filter(Boolean),
    5,
  );
  for (const mediaRef of normalizedRefs) {
    const match = mediaRef.match(KAEL_CHAT_MEDIA_REF_PATTERN);
    if (!match || match[1] !== sessionOwnerId) {
      apiFailure("VALIDATION", "Media bằng chứng không hợp lệ", 400);
    }
  }
  return normalizedRefs;
}
