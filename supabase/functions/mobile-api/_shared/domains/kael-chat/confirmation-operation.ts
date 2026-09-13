// Durable confirmation is a database-owned operation. This adapter deliberately performs one RPC
// and no provider work so HTTP retries recover the same receipt instead of duplicating a job.

import type { EdgeIntakeConfirmationKind, EdgeQuoteMode } from "../../../../_shared/contracts/stage1-reliability.ts";
import {
  confirmationOperationReceiptSchema,
  type EdgeConfirmationOperationReceipt,
} from "../../../../_shared/contracts/stage1-reliability.ts";
import { dbQuery, workflowDb } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";

type RpcResult = {
  data: unknown;
  error: { code?: unknown; message?: unknown } | null;
};

export type ConfirmationOperationClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
};

export type DurableConfirmationResult = {
  ok: boolean;
  errorCode: string | null;
  operationId: string | null;
  receiptId: string | null;
  jobId: string | null;
  jobStatus: string | null;
  quoteMode: EdgeQuoteMode | null;
  operationState: string | null;
  alreadyApplied: boolean;
  acceptedAt: string | null;
  updatedAt: string | null;
  operation: EdgeConfirmationOperationReceipt | null;
  traceFinalized: boolean;
};

export type ConfirmationTraceFinalizer = {
  runId: string;
  traceId: string;
  actorIdHash: string;
  actorRole: string | null;
  routeKind: string;
  capability: string;
  environment: string;
  releaseId: string;
  privileged: boolean;
  resourceType: string;
  resourceIdHash: string | null;
  durationMs: number;
};

export type ConfirmationRecoveryClaim = {
  operationId: string | null;
  jobId: string | null;
  operationState: string | null;
  claimed: boolean;
};

export function buildConfirmationIdempotencyKey(sessionId: string, customerId: string) {
  return `kael-confirm:${sessionId}:${customerId}`;
}

export async function getKaelConfirmationOperation(
  ctx: MobileApiContext,
  sessionId: string,
): Promise<{ operation: EdgeConfirmationOperationReceipt }> {
  const operation = await findKaelConfirmationOperation(ctx, sessionId);
  if (!operation) apiFailure("NOT_FOUND", "Không tìm thấy tiến trình xác nhận", 404);
  return { operation };
}

export async function findKaelConfirmationOperation(
  ctx: MobileApiContext,
  sessionId: string,
): Promise<EdgeConfirmationOperationReceipt | null> {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    workflowDb(ctx).rpc("get_kael_confirmation_operation", {
      p_session_id: sessionId,
      p_customer_id: ctx.user.id,
    }),
  );
  if (result.error) apiFailure("DB_ERROR", "Không thể tải tiến trình xác nhận", 500);
  const row = Array.isArray(result.data)
    ? result.data[0] as Record<string, unknown> | undefined
    : undefined;
  if (!row) return null;
  const parsed = confirmationOperationReceiptSchema.safeParse({
    operation_id: row.operation_id,
    idempotency_key: row.idempotency_key,
    session_id: row.session_id,
    job_id: row.job_id ?? null,
    quote_mode: row.quote_mode,
    state: row.operation_state,
    terminal: row.terminal,
    accepted_at: row.accepted_at,
    updated_at: row.updated_at,
    retry_after_ms: row.retry_after_ms ?? null,
    support_code: row.support_code,
  });
  if (!parsed.success) apiFailure("DB_ERROR", "Tiến trình xác nhận không hợp lệ", 500);
  return parsed.data;
}

export async function claimKaelConfirmationRecovery(
  client: ConfirmationOperationClient,
  input: { sessionId: string; customerId: string },
): Promise<ConfirmationRecoveryClaim | null> {
  const result = await client.rpc("claim_confirmation_matching_outbox", {
    p_session_id: input.sessionId,
    p_customer_id: input.customerId,
    p_lease_seconds: 30,
  });
  if (result.error) {
    const failure = new Error("KAEL_CONFIRM_RECOVERY_CLAIM_FAILED");
    Object.assign(failure, { cause: result.error });
    throw failure;
  }
  const row = Array.isArray(result.data)
    ? result.data[0] as Record<string, unknown> | undefined
    : undefined;
  if (!row) return null;
  return {
    operationId: text(row.operation_id),
    jobId: text(row.job_id),
    operationState: text(row.operation_state),
    claimed: row.claimed === true,
  };
}

export async function requestDurableKaelConfirmation(
  client: ConfirmationOperationClient,
  input: {
    sessionId: string;
    customerId: string;
    confirmationKind: Exclude<EdgeIntakeConfirmationKind, "none">;
    priceReasoningReceiptId: string | null;
    matchingMode?: "prompt_if_saved";
    traceFinalizer?: ConfirmationTraceFinalizer;
  },
): Promise<DurableConfirmationResult> {
  const idempotencyKey = buildConfirmationIdempotencyKey(input.sessionId, input.customerId);
  const result = await client.rpc(input.traceFinalizer
    ? "confirm_kael_chat_durable_authorized_v6"
    : "confirm_kael_chat_durable_atomic_v4", {
    p_session_id: input.sessionId,
    p_customer_id: input.customerId,
    p_idempotency_key: idempotencyKey,
    p_confirmation_kind: input.confirmationKind,
    p_price_reasoning_receipt_id: input.priceReasoningReceiptId,
    p_matching_mode: input.matchingMode ?? null,
    ...(input.traceFinalizer
      ? {
        p_run_id: input.traceFinalizer.runId,
        p_trace_id: input.traceFinalizer.traceId,
        p_actor_id_hash: input.traceFinalizer.actorIdHash,
        p_actor_role: input.traceFinalizer.actorRole,
        p_route_kind: input.traceFinalizer.routeKind,
        p_capability: input.traceFinalizer.capability,
        p_environment: input.traceFinalizer.environment,
        p_release_id: input.traceFinalizer.releaseId,
        p_privileged: input.traceFinalizer.privileged,
        p_resource_type: input.traceFinalizer.resourceType,
        p_resource_id_hash: input.traceFinalizer.resourceIdHash,
        p_duration_ms: input.traceFinalizer.durationMs,
      }
      : {}),
  });
  if (result.error) {
    const failure = new Error("KAEL_CONFIRM_DURABILITY_FAILED");
    Object.assign(failure, { cause: result.error });
    throw failure;
  }
  const row = Array.isArray(result.data)
    ? result.data[0] as Record<string, unknown> | undefined
    : undefined;
  if (!row) throw new Error("KAEL_CONFIRM_DURABILITY_FAILED");
  const ok = row.ok === true;
  const operation = ok
    ? parseAtomicConfirmationOperation(row, input.sessionId, idempotencyKey)
    : null;
  return {
    ok,
    errorCode: text(row.error_code),
    operationId: text(row.operation_id),
    receiptId: text(row.receipt_id),
    jobId: text(row.job_id),
    jobStatus: text(row.job_status),
    quoteMode: quoteMode(row.quote_mode),
    operationState: text(row.operation_state),
    alreadyApplied: row.already_applied === true,
    acceptedAt: text(row.accepted_at),
    updatedAt: text(row.updated_at),
    operation,
    traceFinalized: row.trace_finalized === true,
  };
}

function parseAtomicConfirmationOperation(
  row: Record<string, unknown>,
  sessionId: string,
  expectedIdempotencyKey: string,
): EdgeConfirmationOperationReceipt {
  const parsed = confirmationOperationReceiptSchema.safeParse({
    operation_id: row.operation_id,
    idempotency_key: row.idempotency_key,
    session_id: sessionId,
    job_id: row.job_id ?? null,
    quote_mode: row.quote_mode,
    state: row.operation_state,
    terminal: row.terminal,
    accepted_at: row.accepted_at,
    updated_at: row.updated_at,
    retry_after_ms: row.retry_after_ms ?? null,
    support_code: row.support_code,
  });
  if (!parsed.success || parsed.data.idempotency_key !== expectedIdempotencyKey) {
    throw new Error("KAEL_CONFIRM_DURABILITY_FAILED");
  }
  return parsed.data;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function quoteMode(value: unknown): EdgeQuoteMode | null {
  return value === "kael_auto_quote" || value === "rfq" ||
      value === "inspection_only" || value === "blocked"
    ? value
    : null;
}
