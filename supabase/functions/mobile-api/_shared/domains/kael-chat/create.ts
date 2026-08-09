// Customer Kael-chat creation boundary: validates idempotent input, materializes the
// initial case-work session, then delegates a first safe turn to the analysis flow.

import { compactMetadata } from "../../platform/domain-utils.ts";
import {
  asBoolean,
  asString,
  nullableString,
} from "../../platform/coercions.ts";
import { ensureCustomerCaseConversation, linkCreatedCustomerCaseConversation } from "../customer/kael-conversation.ts";
import {
  sanitizeForLLM,
  type KaelChatCreateInput,
} from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { db, dbQuery, type DbClient } from "../../platform/db.ts";
import { checkKaelChatRateLimit } from "../../platform/rate-limit.ts";
import { takeDurableKaelChatRateLimit } from "../../kael/kael-guardrails/durable-guards.ts";
import type { EdgeAiSecrets } from "../../kael/index.ts";
import {
  sanitizeCustomerCaseEvidenceText,
  sanitizeUntrustedEvidenceList,
} from "../../kael/evidence/untrusted-evidence.ts";
import { advanceKaelChatEstimate } from "./advance.ts";
import {
  maybeApplyKaelBoundaryGuard,
  maybeHandleDemandingCustomerKaelChatTurn,
} from "./guard.ts";
import { prepareInitialKaelChatIntake } from "./intake.ts";
import { getKaelChat } from "./read.service.ts";
import {
  createKaelChatSession,
  retireFailedKaelSessionCreate,
} from "./persistence.service.ts";
import { findExistingKaelSessionByClientRequest, insertKaelTurn, updateKaelSession } from "./session-store.ts";
import { persistentKaelSafetySignals, requiresImmediateKaelSafetyPath } from "./intake-safety.ts";
import { validateFutureHcmcSchedule, HCMC_SCHEDULE_VALIDATION_MESSAGE } from "../../platform/scheduling.ts";
import { sendKaelChatTurn } from "./turn.ts";

type InitialKaelChatIntake = Awaited<ReturnType<typeof prepareInitialKaelChatIntake>>;
type InitialKaelChatMessageInput = {
  client: DbClient;
  ctx: MobileApiContext;
  input: KaelChatCreateInput;
  secrets: EdgeAiSecrets;
  sessionId: string;
  language: "vi" | "en";
  initialSafetySignals: string[];
  prepared: InitialKaelChatIntake;
};

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

  await enforceCreateKaelChatRateLimit(client, ctx, secrets);

  const prepared = await prepareInitialKaelChatIntake({
    ctx,
    input,
    language,
    safeProblemChips,
    initialSafetySignals,
  });
  const created = await createKaelChatSession({
    client,
    ctx,
    ...input,
    metadata: prepared.metadata,
    initialDiagnosisScope: prepared.initialDiagnosisScope,
    initialEvidenceItems: prepared.initialEvidenceItems,
  });
  if (created.kind === "existing") return getKaelChat(ctx, created.sessionId);
  const createdSessionId = created.sessionId;
  if (input.message) {
    await processInitialKaelChatMessage({
      client,
      ctx,
      input,
      secrets,
      sessionId: createdSessionId,
      language,
      initialSafetySignals,
      prepared,
    });
  } else {
    await linkCreatedCustomerCaseConversation(
      ctx,
      createdSessionId,
      input.client_request_id ?? null,
    );
  }

  return getKaelChat(ctx, createdSessionId);
}

async function enforceCreateKaelChatRateLimit(
  client: DbClient,
  ctx: MobileApiContext,
  secrets: EdgeAiSecrets,
) {
  if (secrets.durableGuardsEnabled) {
    const rate = await takeDurableKaelChatRateLimit(client, ctx.user.id);
    if (!rate.allowed) rejectKaelChatRateLimit(rate.reason);
    return;
  }
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
    return;
  }
  console.warn("kael_chat DB rate limit fallback", { errorCode: rate.error.code });
  if (!checkKaelChatRateLimit(ctx.user.id).allowed) {
    apiFailure("RATE_LIMITED", "Vui lòng thử lại sau", 429);
  }
}

async function processInitialKaelChatMessage(input: InitialKaelChatMessageInput) {
  const message = sanitizeForLLM(input.input.message ?? "");
  await persistInitialCustomerKaelChatTurn(input, message);
  if (input.input.defer_analysis || input.prepared.intakeConfirmation) return;
  await advanceInitialKaelChatAnalysis(input, message);
}

async function persistInitialCustomerKaelChatTurn(
  input: InitialKaelChatMessageInput,
  message: string,
) {
  try {
    await Promise.all([
      linkCreatedCustomerCaseConversation(
        input.ctx,
        input.sessionId,
        input.input.client_request_id ?? null,
      ),
      insertKaelTurn(input.client, {
        session_id: input.sessionId,
        turn_index: 1,
        role: "customer",
        content_type: "text",
        text_content: sanitizeCustomerCaseEvidenceText(message),
        media_refs: input.prepared.initialEvidenceRefs,
        safe_metadata: compactMetadata({
          evidence_kinds: input.prepared.initialEvidenceItems.map((evidence) => evidence.kind),
        }),
      }),
    ]);
    await updateKaelSession(input.client, input.sessionId, {
      total_turns: 1,
      safe_metadata: input.prepared.metadata,
    });
  } catch (error) {
    await retireFailedKaelSessionCreate(input.client, input.sessionId, input.ctx.user.id);
    throw error;
  }
}

async function advanceInitialKaelChatAnalysis(
  input: InitialKaelChatMessageInput,
  message: string,
) {
  const boundaryHandled = await maybeApplyKaelBoundaryGuard(
    input.client,
    input.sessionId,
    message,
    input.input.service_type,
    {
      actorId: input.ctx.user.id,
      jobId: null,
      language: input.language,
      persistedSafetySignals: input.initialSafetySignals,
      progressTarget: { table: "kael_chat_sessions", id: input.sessionId },
    },
  );
  if (boundaryHandled) return;
  const safetyPath = requiresImmediateKaelSafetyPath(
    message,
    input.input.service_type,
    input.initialSafetySignals,
  );
  const handledDemandingCustomer = safetyPath ? false : await maybeHandleDemandingCustomerKaelChatTurn(
    input.client,
    {
      sessionId: input.sessionId,
      actorId: input.ctx.user.id,
      jobId: null,
      status: "active",
      metadata: input.prepared.metadata,
      message,
      qaCount: 1,
      language: input.language,
    },
  );
  if (handledDemandingCustomer) return;
  await advanceKaelChatEstimate(
    input.ctx,
    input.sessionId,
    {
      ...input.input,
      address_district: input.prepared.initialAddressDistrict ?? undefined,
      message,
      photo_urls: input.prepared.initialSignedVisionUrls,
      vision_evidence: input.prepared.initialEvidenceItems,
      persisted_safety_signals: input.initialSafetySignals,
    },
    input.secrets,
  );
}

function rejectKaelChatRateLimit(reason: string | null): never {
  apiFailure(
    "RATE_LIMITED",
    reason === "hour"
      ? "Bạn đã đạt giới hạn 20 phiên Kael trong 1 giờ. Vui lòng thử lại sau."
      : "Bạn đang gửi quá nhanh. Vui lòng thử lại sau ít phút.",
    429,
  );
}
