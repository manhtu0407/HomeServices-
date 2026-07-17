// Edge service kael-chat domain: the customer Kael AI-conversation API —
// session create/turn + progress reads. The turn/estimate/boundary/demanding engine lives in
// kael-chat-core.ts. The streaming wrappers + confirm bridge stay in services.ts (import one-way).

import { asBoolean, asNumber, asRecord, asString, asStringArray, asKaelChatStatus, asServiceType, nullableString } from "../_runtime/coercions.ts";
import { db, dbQuery, type DbClient } from "../_runtime/db.ts";
import { compactMetadata, mergeLimitedRefs } from "../_runtime/shared.ts";
import { mergeApartmentAccessProfiles, sanitizeApartmentAccessProfile } from "../apartment-access/index.ts";
import { apiFailure, type MobileApiContext } from "../../router.ts";
import { checkKaelChatRateLimit } from "../../rate-limit.ts";
import { takeDurableKaelChatRateLimit } from "../../kael/guards/durable-guards.ts";
import { buildInitialDiagnosisScopeArtifact, kaelDiagnosisScopeArtifactSchema, scrubSensitiveForLLM, type EdgeAiSecrets, type KaelDiagnosisScopeArtifact } from "../../kael/index.ts";
import { sanitizeUntrustedEvidenceItem, sanitizeUntrustedEvidenceList, sanitizeUntrustedEvidenceText } from "../../kael/guards/untrusted-evidence.ts";
import {
  sanitizeForLLM,
  type KaelChatCreateInput,
  type KaelChatEvidenceInput,
  type KaelChatTurnInput,
} from "../../../../_shared/domain.ts";
import { advanceKaelChatEstimate, assertKaelSessionOwnership, findExistingKaelSessionByClientRequest, insertKaelTurn, maybeApplyKaelBoundaryGuard, maybeHandleDemandingCustomerKaelChatTurn, updateKaelSession } from "./core.ts";
import { persistentKaelSafetySignals, requiresImmediateKaelSafetyPath } from "./intake-safety.ts";
import { getKaelChat } from "./read.ts";
import { ensureCustomerCaseConversation } from "./conversations.ts";
import { rejectKaelChatRateLimit } from "./rate-limit.ts";
import { HCMC_SCHEDULE_VALIDATION_MESSAGE, validateFutureHcmcSchedule } from "../jobs/schedule-policy.ts";
import {
  buildKaelVisionValidationEvidence,
  createKaelChatMediaUpload,
  createSignedVisionUrls,
  revokeKaelChatMedia,
  validateAndConsumeKaelChatEvidenceMediaRefs,
} from "./media.ts";

export async function createKaelChat(
  ctx: MobileApiContext,
  input: KaelChatCreateInput,
  secrets: EdgeAiSecrets,
) {
  if (ctx.role !== "customer") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ khách hàng mới được tạo phiên Kael Xử lý công việc", 403);
  }
  const scheduleValidation = validateFutureHcmcSchedule(
    input.scheduled_at,
    input.schedule_window,
  );
  if (
    scheduleValidation !== null &&
    (!input.client_request_id || input.session_id)
  ) {
    apiFailure("VALIDATION", HCMC_SCHEDULE_VALIDATION_MESSAGE, 400);
  }
  if (input.session_id) {
    if (!input.message) return getKaelChat(ctx, input.session_id);
    return sendKaelChatTurn(ctx, input.session_id, {
      message: input.message,
      problem_chips: input.problem_chips,
      photo_urls: [],
      evidence_items: input.evidence_items,
      language: input.language,
      address_label: input.address_label,
      address_district: input.address_district,
      scheduled_at: input.scheduled_at,
      schedule_window: input.schedule_window,
      apartment_access_profile: input.apartment_access_profile,
    }, secrets);
  }

  const client = db(ctx);
  const language = input.language ?? "vi";
  const safeProblemChips = sanitizeUntrustedEvidenceList(input.problem_chips);
  const initialSafetySignals = persistentKaelSafetySignals(
    sanitizeForLLM(input.message ?? ""),
    input.service_type,
  );

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
      await ensureCustomerCaseConversation(
        ctx,
        existingSession.sessionId,
        input.client_request_id,
      );
      return getKaelChat(ctx, existingSession.sessionId);
    }
    if (existingSession?.kind === "pending") {
      apiFailure(
        "SESSION_PENDING",
        "Phiên Kael đang được tạo. Vui lòng thử lại sau.",
        409,
      );
    }
    if (scheduleValidation !== null) {
      apiFailure("VALIDATION", HCMC_SCHEDULE_VALIDATION_MESSAGE, 400);
    }
  }

  if (secrets.durableGuardsEnabled) {
    const rate = await takeDurableKaelChatRateLimit(client, ctx.user.id);
    if (!rate.allowed) rejectKaelChatRateLimit(rate.reason);
  } else {
    // Keep the existing RPC + warm-isolate fallback as the rollback path.
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
        rejectKaelChatRateLimit(reason);
      }
    } else {
      console.warn("kael_chat DB rate limit fallback", {
        errorCode: rate.error.code,
      });
      const fallback = checkKaelChatRateLimit(ctx.user.id);
      if (!fallback.allowed) {
        apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
      }
    }
  }

  const initialEvidenceItems = sanitizeCaseWorkEvidenceItems(input.evidence_items ?? []);
  const initialEvidenceRefs = await validateAndConsumeKaelChatEvidenceMediaRefs(
    ctx,
    initialEvidenceItems.flatMap((evidence) => evidence.ref ? [evidence.ref] : []),
    ctx.user.id,
  );
  // Decode/transform every model-visible image before creating any durable
  // session or artifact. Consumed intents are retry-safe, so a transient
  // transform failure cannot leave a poisoned case-work record behind.
  const initialSignedVisionUrls = await createSignedVisionUrls(
    ctx,
    initialEvidenceItems,
    ctx.user.id,
  );
  const initialVoiceTranscript = caseWorkVoiceTranscript(initialEvidenceItems);
  const metadata = compactMetadata({
    problem_chips: safeProblemChips,
    language,
    // A zero-turn session is valid when the caller intentionally starts an
    // empty conversation. Persist that distinction so an idempotent replay is
    // not mistaken for an in-flight session forever.
    initial_turn_expected: Boolean(input.message),
    profile_id: input.profile_id ?? null,
    address_label: input.address_label ?? null,
    address_district: input.address_district ?? null,
    apartment_access_profile: sanitizeApartmentAccessProfile(
      input.apartment_access_profile,
    ),
    evidence_media_refs: initialEvidenceRefs,
    evidence_kinds: initialEvidenceItems.map((evidence) => evidence.kind),
    private_video_evidence_count: initialEvidenceItems.filter((evidence) =>
      evidence.kind === "video_original_private"
    ).length,
    schedule_window: input.schedule_window ?? null,
    demanding_customer_qa_count: input.message ? 1 : undefined,
    intake_safety_signals: initialSafetySignals.length > 0 ? initialSafetySignals : undefined,
  });
  const initialArtifact = buildInitialDiagnosisScopeArtifact({
    serviceType: input.service_type,
    customerGoal: sanitizeUntrustedEvidenceText(input.message?.trim() ?? "") ||
      safeProblemChips.join(" ") || input.service_type,
  });
  const initialDiagnosisScope = kaelDiagnosisScopeArtifactSchema.parse({
    ...initialArtifact,
    evidence: mergeCaseWorkEvidence(initialArtifact.evidence, initialEvidenceItems),
    facts: {
      ...initialArtifact.facts,
      ...(initialVoiceTranscript
        ? { latest_voice_transcript: sanitizeUntrustedEvidenceText(initialVoiceTranscript) }
        : {}),
    },
    updated_at: new Date().toISOString(),
  });
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .insert({
        customer_id: ctx.user.id,
        service_type: input.service_type,
        status: "active",
        case_phase: "analysis",
        diagnosis_scope: initialDiagnosisScope,
        scheduled_at: input.scheduled_at ?? null,
        safe_metadata: metadata,
        client_request_id: input.client_request_id ?? null,
      })
      .select(
        "id, job_id, customer_id, service_type, status, case_phase, diagnosis_scope, scheduled_at, started_at, estimate_ready_at, total_turns, total_cost_usd, safe_metadata, created_at",
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
    if (recovered?.kind === "ready") {
      await ensureCustomerCaseConversation(
        ctx,
        recovered.sessionId,
        input.client_request_id,
      );
      return getKaelChat(ctx, recovered.sessionId);
    }
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
  const createdSessionId = asString(sessionResult.data.id);
  await ensureCustomerCaseConversation(
    ctx,
    createdSessionId,
    input.client_request_id ?? null,
  );

  if (input.message) {
    const message = sanitizeForLLM(input.message);
    const sessionId = createdSessionId;
    // Scrub PII (phone/CCCD/address/
    // building/unit) BEFORE persisting to kael_chat_turns.text_content so raw
    // PII never lands in the DB. The in-memory `message` (also sanitized) is
    // still used for boundary detection + analysis; the pipeline scrubs again
    // before any LLM call.
    try {
      await insertKaelTurn(client, {
        session_id: sessionId,
        turn_index: 1,
        role: "customer",
        content_type: "text",
        text_content: scrubSensitiveForLLM(message),
        media_refs: initialEvidenceRefs,
        safe_metadata: compactMetadata({
          evidence_kinds: initialEvidenceItems.map((evidence) => evidence.kind),
        }),
      });
      await updateKaelSession(client, sessionId, {
        total_turns: 1,
        safe_metadata: metadata,
      });
    } catch (error) {
      // The session insert and first turn are separate PostgREST calls. Retire
      // an empty shell if the second step fails so the client's stable
      // idempotency key can safely create a fresh session on retry.
      await retireFailedKaelSessionCreate(client, sessionId, ctx.user.id);
      throw error;
    }
    if (!input.defer_analysis) {
    // Apply boundary guard FIRST so
    // out-of-scope / injection / mismatch messages are declined before the
    // demanding-customer empathy path can intercept and produce a
    // misleading "wait_time_concern" style reply.
    const boundaryHandled = await maybeApplyKaelBoundaryGuard(
      client,
      sessionId,
      message,
      input.service_type,
      {
        actorId: ctx.user.id,
        jobId: null,
        language,
        persistedSafetySignals: initialSafetySignals,
        progressTarget: { table: "kael_chat_sessions", id: sessionId },
      },
    );
    if (!boundaryHandled) {
      const safetyPath = requiresImmediateKaelSafetyPath(
        message,
        input.service_type,
        initialSafetySignals,
      );
      const handledDemandingCustomer =
        safetyPath ? false : await maybeHandleDemandingCustomerKaelChatTurn(
          client,
          {
            sessionId,
            actorId: ctx.user.id,
            jobId: null,
            status: "active",
            metadata,
            message,
            qaCount: 1,
            language,
          },
        );
      if (!handledDemandingCustomer) {
        await advanceKaelChatEstimate(
          ctx,
          sessionId,
          {
            ...input,
            message,
            photo_urls: initialSignedVisionUrls,
            persisted_safety_signals: initialSafetySignals,
          },
          secrets,
        );
      }
    }
    }
  }

  return getKaelChat(ctx, createdSessionId);
}

async function retireFailedKaelSessionCreate(
  client: DbClient,
  sessionId: string,
  customerId: string,
) {
  const retired = await dbQuery<{ id: string }>(
    client
      .from("kael_chat_sessions")
      .update({ client_request_id: null, status: "abandoned" })
      .eq("id", sessionId)
      .eq("customer_id", customerId)
      .eq("status", "active")
      .eq("total_turns", 0)
      .select("id")
      .maybeSingle(),
  );
  if (retired.error) {
    console.warn("mobile-api Kael session create cleanup failed", {
      sessionId,
      errorCode: retired.error.code,
    });
  }
}

export async function sendKaelChatTurn(
  ctx: MobileApiContext,
  sessionId: string,
  input: KaelChatTurnInput,
  secrets: EdgeAiSecrets,
) {
  if (validateFutureHcmcSchedule(input.scheduled_at, input.schedule_window) !== null) {
    apiFailure("VALIDATION", HCMC_SCHEDULE_VALIDATION_MESSAGE, 400);
  }
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select(
        "id, job_id, customer_id, service_type, status, total_turns, safe_metadata, diagnosis_scope",
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
  const language = input.language ?? (previousMetadata.language === "en" ? "en" : "vi");
  const durablePreviousMetadata = withoutEphemeralKaelMediaUrls(previousMetadata);
  const qaCount = asNumber(previousMetadata.demanding_customer_qa_count) + 1;
  const safeProblemChips = sanitizeUntrustedEvidenceList(
    input.problem_chips ?? asStringArray(previousMetadata.problem_chips),
  );
  const sanitizedEvidenceItems = sanitizeCaseWorkEvidenceItems(input.evidence_items ?? []);
  const evidenceRefs = await validateAndConsumeKaelChatEvidenceMediaRefs(
    ctx,
    sanitizedEvidenceItems.flatMap((evidence) => evidence.ref ? [evidence.ref] : []),
    asString(session.customer_id),
  );
  // Validate only the media submitted in this turn. Older evidence is already
  // represented in the artifact and must not make a sixth later upload fail
  // forever. This runs before inserts/updates so invalid bytes cannot poison
  // durable case state.
  const signedVisionUrls = await createSignedVisionUrls(
    ctx,
    sanitizedEvidenceItems,
    asString(session.customer_id),
  );
  const voiceTranscript = caseWorkVoiceTranscript(sanitizedEvidenceItems);
  const message = sanitizeForLLM(input.message || voiceTranscript);
  const persistedSafetySignals = persistentKaelSafetySignals(
    message,
    asServiceType(session.service_type),
    asStringArray(previousMetadata.intake_safety_signals),
  );
  const metadata = compactMetadata({
    ...durablePreviousMetadata,
    language,
    problem_chips: safeProblemChips,
    address_label: input.address_label ??
      nullableString(previousMetadata.address_label),
    address_district: input.address_district ??
      nullableString(previousMetadata.address_district),
    apartment_access_profile: mergeApartmentAccessProfiles(
      previousMetadata.apartment_access_profile,
      input.apartment_access_profile,
    ),
    evidence_media_refs: mergeLimitedRefs(
      asStringArray(previousMetadata.evidence_media_refs),
      evidenceRefs,
      20,
    ),
    evidence_kinds: sanitizedEvidenceItems.map((evidence) => evidence.kind),
    schedule_window: input.schedule_window ?? previousMetadata.schedule_window,
    demanding_customer_qa_count: qaCount,
    intake_safety_signals: persistedSafetySignals.length > 0
      ? persistedSafetySignals
      : undefined,
  });
  // Scrub PII before persisting.
  await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: previousTurns + 1,
    role: "customer",
    content_type: evidenceRefs.length > 0 ? "photo_attached" : "text",
    text_content: scrubSensitiveForLLM(message),
    media_refs: evidenceRefs,
    safe_metadata: compactMetadata({
      evidence_kinds: sanitizedEvidenceItems.map((evidence) => evidence.kind),
      private_video_evidence_count: sanitizedEvidenceItems.filter((evidence) =>
        evidence.kind === "video_original_private"
      ).length,
    }),
  });
  const currentArtifact = kaelDiagnosisScopeArtifactSchema.safeParse(session.diagnosis_scope);
  const diagnosisScope = currentArtifact.success
    ? kaelDiagnosisScopeArtifactSchema.parse({
      ...currentArtifact.data,
      case_phase: "analysis",
      evidence: mergeCaseWorkEvidence(currentArtifact.data.evidence, sanitizedEvidenceItems),
      facts: {
        ...currentArtifact.data.facts,
        ...(voiceTranscript
          ? { latest_voice_transcript: sanitizeUntrustedEvidenceText(voiceTranscript) }
          : {}),
      },
      quote_ready: false,
      quote_blockers: [],
      next_action: { kind: "wait" },
      updated_at: new Date().toISOString(),
    })
    : null;
  await updateKaelSession(client, sessionId, {
    total_turns: previousTurns + 1,
    status: "active",
    case_phase: "analysis",
    ...(diagnosisScope ? { diagnosis_scope: diagnosisScope } : {}),
    ...(input.scheduled_at ? { scheduled_at: input.scheduled_at } : {}),
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
    {
      actorId: ctx.user.id,
      jobId: nullableString(session.job_id),
      language,
      persistedSafetySignals,
      progressTarget: { table: "kael_chat_sessions", id: sessionId },
    },
  );
  if (boundaryHandled) return getKaelChat(ctx, sessionId);

  const safetyPath = requiresImmediateKaelSafetyPath(
    message,
    asServiceType(session.service_type),
    persistedSafetySignals,
  );
  const handledDemandingCustomer = safetyPath ? false : await maybeHandleDemandingCustomerKaelChatTurn(
    client,
    {
      sessionId,
      actorId: ctx.user.id,
      jobId: nullableString(session.job_id),
      status,
      metadata,
      message,
      qaCount,
      language,
    },
  );
  if (handledDemandingCustomer) return getKaelChat(ctx, sessionId);

  await advanceKaelChatEstimate(ctx, sessionId, {
    service_type: asServiceType(session.service_type),
    message,
    problem_chips: asStringArray(metadata.problem_chips),
    photo_urls: signedVisionUrls,
    address_district: nullableString(metadata.address_district) ?? undefined,
    language,
    persisted_safety_signals: persistedSafetySignals,
  }, secrets);

  return getKaelChat(ctx, sessionId);
}

export async function submitKaelChatEvidence(
  ctx: MobileApiContext,
  sessionId: string,
  input: KaelChatEvidenceInput,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select(
        "id, job_id, customer_id, service_type, status, total_turns, safe_metadata, diagnosis_scope",
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

  if (
    input.decision === "skipped" &&
    (
      input.media_refs.length > 0 ||
      input.photo_urls.length > 0 ||
      (input.evidence_items?.length ?? 0) > 0
    )
  ) {
    apiFailure("VALIDATION", "Không thể gửi bằng chứng khi đã chọn bỏ qua", 400);
  }

  const sanitizedEvidenceItems = sanitizeCaseWorkEvidenceItems(input.evidence_items ?? []);
  const visionValidationEvidence = buildKaelVisionValidationEvidence(
    sanitizedEvidenceItems,
    input.media_refs,
  );
  const evidenceRefs = await validateAndConsumeKaelChatEvidenceMediaRefs(
    ctx,
    [
      ...input.media_refs,
      ...sanitizedEvidenceItems.flatMap((evidence) => evidence.ref ? [evidence.ref] : []),
    ],
    asString(session.customer_id),
  );
  const signedVisionUrls = await createSignedVisionUrls(
    ctx,
    visionValidationEvidence,
    asString(session.customer_id),
  );
  if (
    input.decision === "confirmed" &&
    evidenceRefs.length === 0 &&
    sanitizedEvidenceItems.length === 0
  ) {
    apiFailure("VALIDATION", "Cần ít nhất một media bằng chứng", 400);
  }

  const previousMetadata = asRecord(session.safe_metadata);
  const language = input.language ?? (previousMetadata.language === "en" ? "en" : "vi");
  const durablePreviousMetadata = withoutEphemeralKaelMediaUrls(previousMetadata);
  const previousTurns = asNumber(session.total_turns);
  const safeProblemChips = sanitizeUntrustedEvidenceList(
    input.problem_chips ?? asStringArray(previousMetadata.problem_chips),
  );
  const transcriptText = sanitizedEvidenceItems
    .filter((evidence) => evidence.kind === "voice_transcript")
    .map((evidence) => evidence.transcript)
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const message = sanitizeForLLM(
    input.message ?? (
      transcriptText ||
      input.skip_reason ||
      (input.decision === "confirmed"
        ? (language === "en" ? "Evidence submitted." : "Đã gửi bằng chứng.")
        : (language === "en" ? "Evidence skipped." : "Bỏ qua bằng chứng."))
    ),
  );
  const persistedSafetySignals = persistentKaelSafetySignals(
    message,
    asServiceType(session.service_type),
    asStringArray(previousMetadata.intake_safety_signals),
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
      evidence_kinds: sanitizedEvidenceItems.map((evidence) => evidence.kind),
      private_video_evidence_count: sanitizedEvidenceItems.filter((evidence) =>
        evidence.kind === "video_original_private"
      ).length,
      skip_reason: input.skip_reason ?? null,
    }),
  });

  const now = new Date().toISOString();
  const currentArtifact = kaelDiagnosisScopeArtifactSchema.safeParse(session.diagnosis_scope);
  const diagnosisScope = currentArtifact.success
    ? kaelDiagnosisScopeArtifactSchema.parse({
      ...currentArtifact.data,
      case_phase: "analysis",
      evidence: mergeCaseWorkEvidence(currentArtifact.data.evidence, sanitizedEvidenceItems),
      facts: {
        ...currentArtifact.data.facts,
        ...(transcriptText
          ? { latest_voice_transcript: sanitizeUntrustedEvidenceText(transcriptText) }
          : {}),
      },
      quote_ready: false,
      quote_blockers: [],
      next_action: { kind: "wait" },
      updated_at: now,
    })
    : null;
  await updateKaelSession(client, sessionId, {
    total_turns: previousTurns + 1,
    status: "active",
    case_phase: "analysis",
    ...(diagnosisScope ? { diagnosis_scope: diagnosisScope } : {}),
    safe_metadata: compactMetadata({
      ...durablePreviousMetadata,
      language,
      evidence_decision: input.decision,
      evidence_media_refs: mergeLimitedRefs(
        asStringArray(previousMetadata.evidence_media_refs),
        evidenceRefs,
        5,
      ),
      evidence_updated_at: now,
      problem_chips: safeProblemChips,
      skip_reason: input.skip_reason ?? nullableString(previousMetadata.skip_reason),
      intake_safety_signals: persistedSafetySignals.length > 0
        ? persistedSafetySignals
        : undefined,
    }),
  });

  await advanceKaelChatEstimate(ctx, sessionId, {
    service_type: asServiceType(session.service_type),
    message,
    problem_chips: safeProblemChips,
    photo_urls: signedVisionUrls,
    address_district: nullableString(previousMetadata.address_district) ?? undefined,
    language,
    persisted_safety_signals: persistedSafetySignals,
  }, secrets);

  return getKaelChat(ctx, sessionId);
}

function sanitizeCaseWorkEvidenceItems(
  evidenceItems: NonNullable<KaelChatEvidenceInput["evidence_items"]>,
): KaelDiagnosisScopeArtifact["evidence"] {
  return evidenceItems.map((evidence) => {
    const ref = evidence.ref ?? "";
    const expectedPurpose = evidence.kind === "video_original_private"
      ? "/private_video_original/"
      : evidence.kind === "photo" || evidence.kind === "video_frame"
      ? "/model_vision/"
      : null;
    if (expectedPurpose && !ref.includes(expectedPurpose)) {
      apiFailure("VALIDATION", "Loại media bằng chứng không khớp mục đích upload", 400);
    }
    const sanitizedEvidence = sanitizeUntrustedEvidenceItem(evidence);
    if (
      (evidence.kind === "voice_transcript" || evidence.kind === "text_note") &&
      !sanitizedEvidence.transcript
    ) {
      apiFailure("VALIDATION", "Nội dung bằng chứng không có quan sát hợp lệ", 400);
    }
    return sanitizedEvidence;
  });
}

function caseWorkVoiceTranscript(
  evidenceItems: KaelDiagnosisScopeArtifact["evidence"],
) {
  return evidenceItems
    .filter((evidence) => evidence.kind === "voice_transcript")
    .map((evidence) => evidence.transcript)
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function mergeCaseWorkEvidence(
  current: KaelDiagnosisScopeArtifact["evidence"],
  incoming: KaelDiagnosisScopeArtifact["evidence"],
): KaelDiagnosisScopeArtifact["evidence"] {
  const result = [...current];
  const keys = new Set(current.map((evidence) =>
    `${evidence.kind}:${evidence.ref ?? evidence.transcript ?? evidence.summary ?? ""}`
  ));
  for (const evidence of incoming) {
    const key = `${evidence.kind}:${evidence.ref ?? evidence.transcript ?? evidence.summary ?? ""}`;
    if (keys.has(key)) continue;
    keys.add(key);
    result.push(evidence);
    if (result.length >= 20) break;
  }
  return result;
}

function withoutEphemeralKaelMediaUrls(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const { photo_urls: _ephemeralSignedUrls, ...durableMetadata } = metadata;
  return durableMetadata;
}

export { createKaelChatMediaUpload, revokeKaelChatMedia };
export {
  getKaelChat,
  getKaelChatProgress,
  readKaelChatProgressSnapshot,
} from "./read.ts";
