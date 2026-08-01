// Edge service kael-chat domain (C4 6a, services/* split): the customer Kael AI-conversation API —
// session create/turn + progress reads. The turn/estimate/boundary/demanding engine lives in
// kael-chat-core.ts. The streaming wrappers + confirm bridge stay in services.ts (import one-way).

import { asBoolean, asNumber, asRecord, asString, asStringArray, asKaelChatStatus, asServiceType, nullableString } from "./coercions.ts";
import { db, dbQuery } from "./db.ts";
import { compactMetadata, mergeLimitedRefs } from "./_shared.ts";
import { mergeApartmentAccessProfiles, sanitizeApartmentAccessProfile } from "./apartment-access.service.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { checkKaelChatRateLimit } from "../rate-limit.ts";
import { takeDurableKaelChatRateLimit } from "../kael/durable-guards.ts";
import { buildInitialDiagnosisScopeArtifact, kaelDiagnosisScopeArtifactSchema, type EdgeAiSecrets, type KaelDiagnosisScopeArtifact } from "../kael/index.ts";
import { kaelIntakeConfirmationSchema } from "../kael/intake-confirmation.ts";
import {
  sanitizeCustomerCaseEvidenceText,
  sanitizeUntrustedEvidenceList,
  sanitizeUntrustedEvidenceText,
} from "../kael/untrusted-evidence.ts";
import {
  sanitizeForLLM,
  type KaelChatCreateInput,
  type KaelChatEvidenceInput,
  type KaelChatTurnInput,
} from "../../../_shared/domain.ts";
import { advanceKaelChatEstimate, assertKaelSessionOwnership, findExistingKaelSessionByClientRequest, insertKaelTurn, maybeApplyKaelBoundaryGuard, maybeHandleDemandingCustomerKaelChatTurn, updateKaelSession } from "./kael-chat-core.ts";
import {
  caseWorkVoiceTranscript,
  diagnosisScopeForIncomingTurn,
  mergeCaseWorkEvidence,
  sanitizeCaseWorkEvidenceItems,
} from "./kael-chat-case-work.ts";
import { persistentKaelSafetySignals, requiresImmediateKaelSafetyPath } from "./kael-chat-intake-safety.ts";
import { getKaelChat } from "./kael-chat-read.service.ts";
import {
  buildBookingIntakeConfirmation,
  resolveKaelChatAddressDistrict,
} from "./kael-chat-intake.ts";
import {
  ensureCustomerCaseConversation,
  linkCreatedCustomerCaseConversation,
} from "./customer-kael-conversation.service.ts";
import { rejectKaelChatRateLimit } from "./kael-chat-rate-limit.ts";
import {
  persistInitialVoiceTranscripts,
  persistReviewedVoiceTranscripts,
  retireFailedKaelSessionCreate,
} from "./kael-chat-persistence.service.ts";
import { HCMC_SCHEDULE_VALIDATION_MESSAGE, validateFutureHcmcSchedule } from "./scheduling.ts";
import {
  buildKaelVisionValidationEvidence,
  createKaelChatMediaUpload,
  createSignedVisionUrls,
  revokeKaelChatMedia,
  validateAndConsumeKaelChatEvidenceMediaRefs,
} from "./kael-chat-media.service.ts";

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
    input.intake_source !== "booking" &&
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
    if (scheduleValidation !== null && input.intake_source !== "booking") {
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
  const initialAddressDistrict = resolveKaelChatAddressDistrict(
    input.address_district,
    input.message,
  );
  const intakeDescription = sanitizeCustomerCaseEvidenceText(
    sanitizeForLLM(input.intake_description ?? input.message ?? ""),
  );
  const intakeConfirmation = buildBookingIntakeConfirmation({
    intake: input,
    description: intakeDescription,
    problemChips: safeProblemChips,
    addressDistrict: initialAddressDistrict,
    language,
  });
  const metadata = compactMetadata({
    problem_chips: safeProblemChips,
    language,
    // A zero-turn session is valid when the caller intentionally starts an
    // empty conversation. Persist that distinction so an idempotent replay is
    // not mistaken for an in-flight session forever.
    initial_turn_expected: Boolean(input.message),
    profile_id: input.profile_id ?? null,
    intake_source: input.intake_source ?? "direct_chat",
    intake_description: intakeDescription || undefined,
    intake_confirmation: intakeConfirmation ?? undefined,
    address_label: input.address_label ?? null,
    address_district: initialAddressDistrict,
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
    customerGoal: intakeDescription ||
      safeProblemChips.join(" ") || input.service_type,
  });
  const initialDiagnosisScope = kaelDiagnosisScopeArtifactSchema.parse({
    ...initialArtifact,
    evidence: mergeCaseWorkEvidence(initialArtifact.evidence, initialEvidenceItems),
    facts: {
      ...initialArtifact.facts,
      ...(initialVoiceTranscript
        ? { latest_voice_transcript: sanitizeCustomerCaseEvidenceText(initialVoiceTranscript) }
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
  await persistInitialVoiceTranscripts(
    client,
    ctx.user.id,
    createdSessionId,
    initialEvidenceItems,
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
      await Promise.all([
        linkCreatedCustomerCaseConversation(
          ctx,
          sessionId,
          input.client_request_id ?? null,
        ),
        insertKaelTurn(client, {
          session_id: sessionId,
          turn_index: 1,
          role: "customer",
          content_type: "text",
          text_content: sanitizeCustomerCaseEvidenceText(message),
          media_refs: initialEvidenceRefs,
          safe_metadata: compactMetadata({
            evidence_kinds: initialEvidenceItems.map((evidence) => evidence.kind),
          }),
        }),
      ]);
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
    if (!input.defer_analysis && !intakeConfirmation) {
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
            address_district: initialAddressDistrict ?? undefined,
            message,
            photo_urls: initialSignedVisionUrls,
            persisted_safety_signals: initialSafetySignals,
          },
          secrets,
        );
      }
    }
    }
  } else {
    await linkCreatedCustomerCaseConversation(
      ctx,
      createdSessionId,
      input.client_request_id ?? null,
    );
  }

  return getKaelChat(ctx, createdSessionId);
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
  assertIntakeConfirmationCompleted(previousMetadata);
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
  const resolvedAddressDistrict = resolveKaelChatAddressDistrict(
    input.address_district,
    message,
    nullableString(previousMetadata.address_district),
  );
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
    address_district: resolvedAddressDistrict ?? undefined,
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
  await persistReviewedVoiceTranscripts(
    client,
    asString(session.customer_id),
    sessionId,
    sanitizedEvidenceItems,
  );
  // Scrub PII before persisting.
  await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: previousTurns + 1,
    role: "customer",
    content_type: evidenceRefs.length > 0 ? "photo_attached" : "text",
    text_content: sanitizeCustomerCaseEvidenceText(message),
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
    ? diagnosisScopeForIncomingTurn(currentArtifact.data, {
      evidence: mergeCaseWorkEvidence(currentArtifact.data.evidence, sanitizedEvidenceItems),
      hasNewEvidence: sanitizedEvidenceItems.length > 0,
      voiceTranscript: voiceTranscript
        ? sanitizeCustomerCaseEvidenceText(voiceTranscript)
        : null,
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
  assertIntakeConfirmationCompleted(asRecord(session.safe_metadata));

  const requestedEvidence = kaelDiagnosisScopeArtifactSchema.safeParse(
    session.diagnosis_scope,
  );
  if (
    input.decision === "skipped" &&
    requestedEvidence.success &&
    requestedEvidence.data.next_action.kind === "request_evidence" &&
    requestedEvidence.data.next_action.required
  ) {
    apiFailure("EVIDENCE_REQUIRED", "Không thể bỏ qua bằng chứng bắt buộc", 409);
  }
  const safeSkipReason = input.skip_reason
    ? sanitizeUntrustedEvidenceText(input.skip_reason).slice(0, 500)
    : null;
  if (input.decision === "skipped" && !safeSkipReason) {
    apiFailure("VALIDATION", "Cần lý do ngắn khi bỏ qua bằng chứng", 400);
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
  const durablePreviousSkipReason = sanitizeUntrustedEvidenceText(
    nullableString(previousMetadata.skip_reason) ?? "",
  ).slice(0, 500) || null;
  const previousTurns = asNumber(session.total_turns);
  const safeProblemChips = sanitizeUntrustedEvidenceList(
    input.problem_chips ?? asStringArray(previousMetadata.problem_chips),
  );
  const transcriptText = sanitizedEvidenceItems
    .filter((evidence) => evidence.kind === "voice_transcript")
    .map((evidence) => evidence.transcript)
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const videoFrameContext = sanitizedEvidenceItems
    .filter((evidence) => evidence.kind === "video_frame")
    .map((evidence) => evidence.summary)
    .filter((value): value is string => Boolean(value));
  const message = sanitizeForLLM(
    input.message ?? (
      transcriptText ||
      safeSkipReason ||
      (input.decision === "confirmed"
        ? (language === "en" ? "Evidence submitted." : "Đã gửi bằng chứng.")
        : (language === "en" ? "Evidence skipped." : "Bỏ qua bằng chứng."))
    ),
  );
  const modelMessage = sanitizeForLLM([
    message,
    transcriptText,
    ...videoFrameContext,
  ].filter((value, index, values) => value && values.indexOf(value) === index).join("\n\n"));
  const persistedSafetySignals = persistentKaelSafetySignals(
    message,
    asServiceType(session.service_type),
    asStringArray(previousMetadata.intake_safety_signals),
  );
  await persistReviewedVoiceTranscripts(
    client,
    asString(session.customer_id),
    sessionId,
    sanitizedEvidenceItems,
  );
  await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: previousTurns + 1,
    role: "customer",
    content_type: evidenceRefs.length > 0 ? "photo_attached" : "text",
    text_content: sanitizeCustomerCaseEvidenceText(message),
    media_refs: evidenceRefs,
    safe_metadata: compactMetadata({
      evidence_decision: input.decision,
      evidence_kinds: sanitizedEvidenceItems.map((evidence) => evidence.kind),
      private_video_evidence_count: sanitizedEvidenceItems.filter((evidence) =>
        evidence.kind === "video_original_private"
      ).length,
      skip_reason: safeSkipReason,
    }),
  });

  const now = new Date().toISOString();
  const diagnosisScope = requestedEvidence.success
    ? kaelDiagnosisScopeArtifactSchema.parse({
      ...requestedEvidence.data,
      case_phase: "analysis",
      evidence: mergeCaseWorkEvidence(requestedEvidence.data.evidence, sanitizedEvidenceItems),
      facts: {
        ...requestedEvidence.data.facts,
        evidence_gate_decision: input.decision,
        ...(transcriptText
          ? { latest_voice_transcript: sanitizeCustomerCaseEvidenceText(transcriptText) }
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
      skip_reason: safeSkipReason ?? durablePreviousSkipReason,
      intake_safety_signals: persistedSafetySignals.length > 0
        ? persistedSafetySignals
        : undefined,
    }),
  });

  await advanceKaelChatEstimate(ctx, sessionId, {
    service_type: asServiceType(session.service_type),
    message: modelMessage,
    problem_chips: safeProblemChips,
    photo_urls: signedVisionUrls,
    address_district: nullableString(previousMetadata.address_district) ?? undefined,
    language,
    persisted_safety_signals: persistedSafetySignals,
  }, secrets);

  return getKaelChat(ctx, sessionId);
}

function withoutEphemeralKaelMediaUrls(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const { photo_urls: _ephemeralSignedUrls, ...durableMetadata } = metadata;
  return durableMetadata;
}

function assertIntakeConfirmationCompleted(metadata: Record<string, unknown>) {
  const confirmation = kaelIntakeConfirmationSchema.safeParse(
    metadata.intake_confirmation,
  );
  if (confirmation.success && confirmation.data.status === "pending") {
    apiFailure(
      "INTAKE_CONFIRMATION_REQUIRED",
      "Hãy xác nhận thông tin trước khi Kael tiếp tục.",
      409,
    );
  }
}

export { createKaelChatMediaUpload, revokeKaelChatMedia };
export {
  getKaelChat,
  getKaelChatProgress,
  readKaelChatProgressSnapshot,
} from "./kael-chat-read.service.ts";
