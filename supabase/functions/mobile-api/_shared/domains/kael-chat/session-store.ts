import { asNumber, asRecord, asString, nullableNumber, nullableString } from "../../platform/coercions.ts";
import { compactMetadata } from "../../platform/domain-utils.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { normalizeKaelResponseBrand } from "../../kael/language/user-facing-copy.ts";
import { kaelIntakeConfirmationSchema } from "../../kael/pipeline/intake-confirmation.ts";

type ExistingKaelSessionByClientRequest =
  | { kind: "ready"; sessionId: string }
  | { kind: "pending" }
  | null;

export async function insertKaelTurn(
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

export async function updateKaelSession(
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

export function withoutEphemeralKaelMediaUrls(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const { photo_urls: _ephemeralSignedUrls, ...durableMetadata } = metadata;
  return durableMetadata;
}

export function assertIntakeConfirmationCompleted(metadata: Record<string, unknown>) {
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

export function assertKaelSessionOwnership(
  session: Record<string, unknown>,
  ctx: MobileApiContext,
) {
  if (ctx.role === "admin") return;
  if (session.customer_id === ctx.user.id) return;
  apiFailure("NOT_FOUND", "Không tìm thấy phiên Kael", 404);
}

export async function findExistingKaelSessionByClientRequest(
  client: DbClient,
  customerId: string,
  clientRequestId: string,
): Promise<ExistingKaelSessionByClientRequest> {
  const result = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, job_id, status, estimate_ready_at, total_turns, safe_metadata")
      .eq("customer_id", customerId)
      .eq("client_request_id", clientRequestId)
      .maybeSingle(),
  );
  if (result.error || !result.data) return null;
  const sessionId = asString(result.data.id);
  if (!sessionId) return null;
  const hasMaterializedTurn = (nullableNumber(result.data.total_turns) ?? 0) > 0;
  const hasJob = nullableString(result.data.job_id) !== null;
  const hasEstimate = nullableString(result.data.estimate_ready_at) !== null;
  const intentionallyEmpty = asRecord(result.data.safe_metadata)
    .initial_turn_expected === false;
  if (!hasMaterializedTurn && !hasJob && !hasEstimate && !intentionallyEmpty) {
    return { kind: "pending" };
  }
  return { kind: "ready", sessionId };
}

export async function appendKaelSystemTurn(
  client: DbClient,
  sessionId: string,
  input: {
    contentType: "clarification" | "estimate" | "error";
    text: string;
    nextStatus: "active" | "estimate_ready" | "unsupported";
    estimate?: unknown;
    costUsd?: number;
    metadata?: Record<string, unknown>;
    sessionMetadata?: Record<string, unknown>;
  },
) {
  const sessionResult = await dbQuery<Record<string, unknown>>(
    client
      .from("kael_chat_sessions")
      .select("id, total_turns, total_cost_usd, safe_metadata")
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
    text_content: normalizeKaelResponseBrand(input.text),
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
  if (input.sessionMetadata) {
    sessionUpdate.safe_metadata = compactMetadata({
      ...asRecord(sessionResult.data.safe_metadata),
      ...input.sessionMetadata,
    });
  }
  await updateKaelSession(client, sessionId, sessionUpdate);
}

export async function getKaelChatCostUsd(
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
