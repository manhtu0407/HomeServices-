// Customer Kael-chat evidence submission boundary.

import {
  asKaelChatStatus,
  asNumber,
  asRecord,
  asServiceType,
  asString,
  asStringArray,
  nullableString,
} from "../../platform/coercions.ts";
import { compactMetadata } from "../../platform/domain-utils.ts";
import { mergeLimitedRefs } from "../../platform/job-media.ts";
import {
  sanitizeForLLM,
  type KaelChatEvidenceInput,
} from "../../../../_shared/domain.ts";
import {
  kaelDiagnosisScopeArtifactSchema,
  type EdgeAiSecrets,
} from "../../kael/index.ts";
import {
  sanitizeCustomerCaseEvidenceText,
  sanitizeUntrustedEvidenceList,
  sanitizeUntrustedEvidenceText,
} from "../../kael/evidence/untrusted-evidence.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { advanceKaelChatEstimate } from "./advance.ts";
import {
  mergeCaseWorkEvidence,
  sanitizeCaseWorkEvidenceItems,
} from "./case-work-context.ts";
import { persistentKaelSafetySignals } from "./intake-safety.ts";
import {
  buildKaelVisionValidationEvidence,
  createSignedVisionUrls,
} from "./media-vision.ts";
import { validateAndConsumeKaelChatEvidenceMediaRefs } from "./media-upload.ts";
import { persistReviewedVoiceTranscripts } from "./persistence.service.ts";
import { getKaelChat } from "./read.service.ts";
import {
  assertIntakeConfirmationCompleted,
  assertKaelSessionOwnership,
  insertKaelTurn,
  updateKaelSession,
  withoutEphemeralKaelMediaUrls,
} from "./session-store.ts";

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

  return persistKaelChatEvidenceSubmission({
    client,
    ctx,
    sessionId,
    input,
    secrets,
    session,
    requestedEvidence,
    sanitizedEvidenceItems,
    evidenceRefs,
    signedVisionUrls,
    safeSkipReason,
  });
}

async function persistKaelChatEvidenceSubmission(input: {
  client: DbClient;
  ctx: MobileApiContext;
  sessionId: string;
  input: KaelChatEvidenceInput;
  secrets: EdgeAiSecrets;
  session: Record<string, unknown>;
  requestedEvidence: ReturnType<typeof kaelDiagnosisScopeArtifactSchema.safeParse>;
  sanitizedEvidenceItems: ReturnType<typeof sanitizeCaseWorkEvidenceItems>;
  evidenceRefs: string[];
  signedVisionUrls: string[];
  safeSkipReason: string | null;
}) {
  const {
    client,
    ctx,
    sessionId,
    secrets,
    session,
    requestedEvidence,
    sanitizedEvidenceItems,
    evidenceRefs,
    signedVisionUrls,
    safeSkipReason,
  } = input;
  const previousMetadata = asRecord(session.safe_metadata);
  const language = input.input.language ?? (previousMetadata.language === "en" ? "en" : "vi");
  const durablePreviousMetadata = withoutEphemeralKaelMediaUrls(previousMetadata);
  const durablePreviousSkipReason = sanitizeUntrustedEvidenceText(
    nullableString(previousMetadata.skip_reason) ?? "",
  ).slice(0, 500) || null;
  const previousTurns = asNumber(session.total_turns);
  const safeProblemChips = sanitizeUntrustedEvidenceList(
    input.input.problem_chips ?? asStringArray(previousMetadata.problem_chips),
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
    input.input.message ?? (
      transcriptText ||
      safeSkipReason ||
      (input.input.decision === "confirmed"
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
      evidence_decision: input.input.decision,
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
        evidence_gate_decision: input.input.decision,
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
      evidence_decision: input.input.decision,
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
    vision_evidence: sanitizedEvidenceItems,
    address_district: nullableString(previousMetadata.address_district) ?? undefined,
    language,
    persisted_safety_signals: persistedSafetySignals,
  }, secrets);

  return getKaelChat(ctx, sessionId);
}
