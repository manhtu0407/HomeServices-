// Customer Kael-chat follow-up turn boundary.

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
import { mergeApartmentAccessProfiles } from "../worker/apartment-access.ts";
import {
  sanitizeForLLM,
  type KaelChatTurnInput,
} from "../../../../_shared/domain.ts";
import {
  kaelDiagnosisScopeArtifactSchema,
  type EdgeAiSecrets,
} from "../../kael/index.ts";
import {
  sanitizeCustomerCaseEvidenceText,
} from "../../kael/evidence/untrusted-evidence.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { validateFutureHcmcSchedule, HCMC_SCHEDULE_VALIDATION_MESSAGE } from "../../platform/scheduling.ts";
import { advanceKaelChatEstimate } from "./advance.ts";
import {
  diagnosisScopeForIncomingTurn,
} from "./case-work-artifact.ts";
import {
  caseWorkVoiceTranscript,
  mergeCaseWorkEvidence,
  sanitizeCaseWorkEvidenceItems,
} from "./case-work-context.ts";
import {
  maybeApplyKaelBoundaryGuard,
  maybeHandleDemandingCustomerKaelChatTurn,
} from "./guard.ts";
import {
  resolveKaelChatAddressDistrict,
  resolveKaelChatProblemChips,
} from "./intake.ts";
import { persistentKaelSafetySignals, requiresImmediateKaelSafetyPath } from "./intake-safety.ts";
import { createSignedVisionUrls } from "./media-vision.ts";
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

type PersistedKaelChatTurn = {
  status: ReturnType<typeof asKaelChatStatus>;
  language: "vi" | "en";
  metadata: Record<string, unknown>;
  qaCount: number;
  message: string;
  persistedSafetySignals: string[];
  signedVisionUrls: string[];
  sanitizedEvidenceItems: ReturnType<typeof sanitizeCaseWorkEvidenceItems>;
};

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
        "id, job_id, customer_id, service_type, status, case_phase, total_turns, safe_metadata, diagnosis_scope",
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

  if (input.turn_intent === "price_question") {
    return getKaelChat(ctx, sessionId);
  }

  const persisted = await persistIncomingKaelChatTurn({
    client,
    ctx,
    sessionId,
    input,
    session,
    status,
  });
  if (await handleIncomingKaelChatTurnBoundary({
    client,
    ctx,
    sessionId,
    session,
    persisted,
  })) return getKaelChat(ctx, sessionId);
  await advanceKaelChatEstimate(ctx, sessionId, {
    service_type: asServiceType(session.service_type),
    message: persisted.message,
    problem_chips: asStringArray(persisted.metadata.problem_chips),
    photo_urls: persisted.signedVisionUrls,
    vision_evidence: persisted.sanitizedEvidenceItems,
    address_district: nullableString(persisted.metadata.address_district) ?? undefined,
    language: persisted.language,
    persisted_safety_signals: persisted.persistedSafetySignals,
  }, secrets);

  return getKaelChat(ctx, sessionId);
}

async function persistIncomingKaelChatTurn(input: {
  client: DbClient;
  ctx: MobileApiContext;
  sessionId: string;
  input: KaelChatTurnInput;
  session: Record<string, unknown>;
  status: ReturnType<typeof asKaelChatStatus>;
}): Promise<PersistedKaelChatTurn> {
  const previousTurns = asNumber(input.session.total_turns);
  const previousMetadata = asRecord(input.session.safe_metadata);
  assertIntakeConfirmationCompleted(previousMetadata);
  const language = input.input.language ?? (previousMetadata.language === "en" ? "en" : "vi");
  const safeProblemChips = resolveKaelChatProblemChips(
    input.input.problem_chips,
    asStringArray(previousMetadata.problem_chips),
  );
  const sanitizedEvidenceItems = sanitizeCaseWorkEvidenceItems(input.input.evidence_items ?? []);
  const evidenceRefs = await validateAndConsumeKaelChatEvidenceMediaRefs(
    input.ctx,
    sanitizedEvidenceItems.flatMap((evidence) => evidence.ref ? [evidence.ref] : []),
    asString(input.session.customer_id),
  );
  const signedVisionUrls = await createSignedVisionUrls(
    input.ctx,
    sanitizedEvidenceItems,
    asString(input.session.customer_id),
  );
  const voiceTranscript = caseWorkVoiceTranscript(sanitizedEvidenceItems);
  const message = sanitizeForLLM(input.input.message || voiceTranscript);
  const resolvedAddressDistrict = resolveKaelChatAddressDistrict(
    input.input.address_district,
    message,
    nullableString(previousMetadata.address_district),
  );
  const persistedSafetySignals = persistentKaelSafetySignals(
    message,
    asServiceType(input.session.service_type),
    asStringArray(previousMetadata.intake_safety_signals),
    input.ctx.user.id,
  );
  const qaCount = asNumber(previousMetadata.demanding_customer_qa_count) + 1;
  const metadata = buildIncomingKaelChatMetadata(
    input.input,
    previousMetadata,
    language,
    safeProblemChips,
    evidenceRefs,
    resolvedAddressDistrict,
    qaCount,
    persistedSafetySignals,
    sanitizedEvidenceItems,
  );
  await persistReviewedVoiceTranscripts(
    input.client,
    asString(input.session.customer_id),
    input.sessionId,
    sanitizedEvidenceItems,
  );
  await insertKaelTurn(input.client, {
    session_id: input.sessionId,
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
  await updateKaelSession(input.client, input.sessionId, buildIncomingKaelChatSessionPatch(
    input.session,
    input.input,
    previousTurns,
    sanitizedEvidenceItems,
    voiceTranscript,
    metadata,
  ));
  return {
    status: input.status,
    language,
    metadata,
    qaCount,
    message,
    persistedSafetySignals,
    signedVisionUrls,
    sanitizedEvidenceItems,
  };
}

function buildIncomingKaelChatMetadata(
  turn: KaelChatTurnInput,
  previousMetadata: Record<string, unknown>,
  language: "vi" | "en",
  safeProblemChips: string[],
  evidenceRefs: string[],
  addressDistrict: string | null,
  qaCount: number,
  persistedSafetySignals: string[],
  evidenceItems: ReturnType<typeof sanitizeCaseWorkEvidenceItems>,
) {
  return compactMetadata({
    ...withoutEphemeralKaelMediaUrls(previousMetadata),
    language,
    problem_chips: safeProblemChips,
    address_label: turn.address_label ?? nullableString(previousMetadata.address_label),
    address_district: addressDistrict ?? undefined,
    apartment_access_profile: mergeApartmentAccessProfiles(
      previousMetadata.apartment_access_profile,
      turn.apartment_access_profile,
    ),
    evidence_media_refs: mergeLimitedRefs(
      asStringArray(previousMetadata.evidence_media_refs),
      evidenceRefs,
      20,
    ),
    evidence_kinds: evidenceItems.map((evidence) => evidence.kind),
    schedule_window: turn.schedule_window ?? previousMetadata.schedule_window,
    demanding_customer_qa_count: qaCount,
    intake_safety_signals: persistedSafetySignals.length > 0 ? persistedSafetySignals : undefined,
  });
}

function buildIncomingKaelChatSessionPatch(
  session: Record<string, unknown>,
  turn: KaelChatTurnInput,
  previousTurns: number,
  evidenceItems: ReturnType<typeof sanitizeCaseWorkEvidenceItems>,
  voiceTranscript: string,
  metadata: Record<string, unknown>,
) {
  const currentArtifact = kaelDiagnosisScopeArtifactSchema.safeParse(session.diagnosis_scope);
  const diagnosisScope = currentArtifact.success
    ? diagnosisScopeForIncomingTurn(currentArtifact.data, {
      evidence: mergeCaseWorkEvidence(currentArtifact.data.evidence, evidenceItems),
      hasNewEvidence: evidenceItems.length > 0,
      voiceTranscript: voiceTranscript ? sanitizeCustomerCaseEvidenceText(voiceTranscript) : null,
    })
    : null;
  return {
    total_turns: previousTurns + 1,
    status: "active" as const,
    case_phase: "analysis" as const,
    ...(diagnosisScope ? { diagnosis_scope: diagnosisScope } : {}),
    ...(turn.scheduled_at ? { scheduled_at: turn.scheduled_at } : {}),
    safe_metadata: metadata,
  };
}

async function handleIncomingKaelChatTurnBoundary(input: {
  client: DbClient;
  ctx: MobileApiContext;
  sessionId: string;
  session: Record<string, unknown>;
  persisted: PersistedKaelChatTurn;
}): Promise<boolean> {
  const serviceType = asServiceType(input.session.service_type);
  const boundaryHandled = await maybeApplyKaelBoundaryGuard(
    input.client,
    input.sessionId,
    input.persisted.message,
    serviceType,
    {
      actorId: input.ctx.user.id,
      jobId: nullableString(input.session.job_id),
      language: input.persisted.language,
      persistedSafetySignals: input.persisted.persistedSafetySignals,
      progressTarget: { table: "kael_chat_sessions", id: input.sessionId },
    },
  );
  if (boundaryHandled) return true;
  if (requiresImmediateKaelSafetyPath(
    input.persisted.message,
    serviceType,
    input.persisted.persistedSafetySignals,
    input.ctx.user.id,
  )) return false;
  return maybeHandleDemandingCustomerKaelChatTurn(input.client, {
    sessionId: input.sessionId,
    actorId: input.ctx.user.id,
    jobId: nullableString(input.session.job_id),
    status: input.persisted.status,
    casePhase: input.session.case_phase,
    diagnosisScope: input.session.diagnosis_scope,
    metadata: input.persisted.metadata,
    message: input.persisted.message,
    qaCount: input.persisted.qaCount,
    language: input.persisted.language,
  });
}
