import type {
  EdgeKaelChatIntakeConfirmationDecisionInput,
  ServiceType,
} from "../../../../_shared/domain.ts";
import type { EdgeKaelIntakeConfirmation } from "../../../../_shared/contracts.ts";
import {
  buildKaelIntakeConfirmation,
  kaelIntakeConfirmationSchema,
  updateKaelIntakeConfirmationStatus,
} from "../../kael/pipeline/intake-confirmation.ts";
import {
  kaelDiagnosisScopeArtifactSchema,
  type EdgeAiSecrets,
} from "../../kael/index.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
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
import { db, dbQuery } from "../../platform/db.ts";
import { advanceKaelChatEstimate } from "./advance.ts";
import {
  assertKaelSessionOwnership,
  insertKaelTurn,
  updateKaelSession,
} from "./session-store.ts";
import { persistentKaelSafetySignals } from "./intake-safety.ts";
import { createSignedVisionUrls } from "./media-vision.ts";
import { getKaelChat } from "./read.service.ts";

export async function decideKaelIntakeConfirmation(
  ctx: MobileApiContext,
  sessionId: string,
  input: EdgeKaelChatIntakeConfirmationDecisionInput,
  secrets: EdgeAiSecrets,
) {
  const client = db(ctx);
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select(
        "id, job_id, customer_id, service_type, status, case_phase, diagnosis_scope, scheduled_at, total_turns, safe_metadata",
      )
      .eq("id", sessionId)
      .single(),
  );
  if (sessionResult.error || !sessionResult.data) {
    apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
  }

  const session = sessionResult.data;
  assertKaelSessionOwnership(session, ctx);
  const metadata = asRecord(session.safe_metadata);
  const confirmationResult = kaelIntakeConfirmationSchema.safeParse(
    metadata.intake_confirmation,
  );
  if (!confirmationResult.success) {
    apiFailure(
      "INTAKE_CONFIRMATION_UNAVAILABLE",
      "Phiên này không có bước xác nhận thông tin.",
      409,
    );
  }
  const confirmation = confirmationResult.data;
  if (
    confirmation.status === "confirmed" ||
    confirmation.status === "correction_requested"
  ) {
    return getKaelChat(ctx, sessionId);
  }

  const status = asKaelChatStatus(session.status);
  if (status !== "active") {
    apiFailure(
      "INVALID_STATUS",
      "Phiên Kael này không còn nhận xác nhận thông tin.",
      409,
    );
  }

  const previousTurns = asNumber(session.total_turns);
  if (input.decision === "correction_requested") {
    const updatedConfirmation = updateKaelIntakeConfirmationStatus(
      confirmation,
      "correction_requested",
    );
    await insertKaelTurn(client, {
      session_id: sessionId,
      turn_index: previousTurns + 1,
      role: "customer",
      content_type: "text",
      text_content: "Thông tin chưa đúng, cần chỉnh sửa.",
      media_refs: [],
      safe_metadata: { intake_decision: "correction_requested" },
    });
    await updateKaelSession(client, sessionId, {
      status: "abandoned",
      total_turns: previousTurns + 1,
      safe_metadata: compactMetadata({
        ...metadata,
        intake_confirmation: updatedConfirmation,
      }),
    });
    return getKaelChat(ctx, sessionId);
  }

  // Re-check time-sensitive fields at the confirmation boundary, not only
  // when the route first created the session.
  const refreshedConfirmation = buildKaelIntakeConfirmation({
    actorId: ctx.user.id,
    serviceType: confirmation.intake.service_type,
    profileId: confirmation.intake.profile_id,
    description: confirmation.intake.description,
    problemChips: confirmation.intake.problem_chips,
    addressLabel: confirmation.intake.address_label,
    addressDistrict: confirmation.intake.address_district,
    scheduledAt: confirmation.intake.scheduled_at,
    scheduleWindow: confirmation.intake.schedule_window,
    language: metadata.language === "en" ? "en" : "vi",
  });
  if (refreshedConfirmation.blocking) {
    await updateKaelSession(client, sessionId, {
      safe_metadata: compactMetadata({
        ...metadata,
        intake_confirmation: refreshedConfirmation,
      }),
    });
    return getKaelChat(ctx, sessionId);
  }

  const updatedConfirmation = updateKaelIntakeConfirmationStatus(
    refreshedConfirmation,
    "confirmed",
  );
  await insertKaelTurn(client, {
    session_id: sessionId,
    turn_index: previousTurns + 1,
    role: "customer",
    content_type: "text",
    text_content: "Đã xác nhận thông tin.",
    media_refs: [],
    safe_metadata: { intake_decision: "confirmed" },
  });
  await updateKaelSession(client, sessionId, {
    status: "active",
    total_turns: previousTurns + 1,
    safe_metadata: compactMetadata({
      ...metadata,
      intake_confirmation: updatedConfirmation,
    }),
  });

  await advanceConfirmedIntakeEstimate(ctx, sessionId, session, metadata, confirmation, secrets);

  return getKaelChat(ctx, sessionId);
}

async function advanceConfirmedIntakeEstimate(
  ctx: MobileApiContext,
  sessionId: string,
  session: Record<string, unknown>,
  metadata: Record<string, unknown>,
  confirmation: EdgeKaelIntakeConfirmation,
  secrets: EdgeAiSecrets,
) {
  const diagnosisScope = kaelDiagnosisScopeArtifactSchema.safeParse(session.diagnosis_scope);
  const photoUrls = diagnosisScope.success
    ? await createSignedVisionUrls(ctx, diagnosisScope.data.evidence, asString(session.customer_id))
    : [];
  const serviceType = asServiceType(confirmation.intake.service_type) as ServiceType;
  const safetySignals = persistentKaelSafetySignals(
    confirmation.intake.description,
    serviceType,
    asStringArray(metadata.intake_safety_signals),
    ctx.user.id,
  );
  await advanceKaelChatEstimate(ctx, sessionId, {
    service_type: serviceType,
    message: confirmation.intake.description,
    problem_chips: confirmation.intake.problem_chips,
    photo_urls: photoUrls,
    vision_evidence: diagnosisScope.success ? diagnosisScope.data.evidence : [],
    address_district: nullableString(confirmation.intake.address_district) ?? undefined,
    language: metadata.language === "en" ? "en" : "vi",
    persisted_safety_signals: safetySignals,
  }, secrets);
}
