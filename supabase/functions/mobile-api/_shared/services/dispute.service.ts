// Edge service dispute domain (C4 6a, services/* split): open / counter-statement / admin-decide,
// each via an atomic RPC with Kael neutral-summary guarding. Imported directly by services.ts.

import { asBoolean, asDisputePriority, asString, nullableString } from "./coercions.ts";
import { db, dbQuery } from "./db.ts";
import { validateJobEvidenceRefs, type JobEvidenceStage } from "./jobs/evidence-refs.ts";
import { mapDisputeCounterError, mapDisputeDecisionError, mapDisputeOpenError } from "./_shared.ts";
import { logJobEvent } from "./audit.ts";
import { apiFailure, type MobileApiContext } from "../router.ts";
import { assertNeutralDisputeLanguage, buildNeutralDisputeSummary, determineDisputeSubCase, type DisputeType } from "../kael/index.ts";
import type { DisputeAdminDecisionInput, DisputeCounterStatementInput, DisputeOpenRequestInput } from "../../../_shared/domain.ts";

export async function openDispute(
  ctx: MobileApiContext,
  jobId: string,
  input: DisputeOpenRequestInput,
) {
  const client = db(ctx);
  const evidencePhotoRefs = await validateJobEvidenceRefs(client, {
    jobId,
    mediaRefs: input.evidence_photo_urls,
    allowedStages: DISPUTE_EVIDENCE_STAGES,
    ownerId: ctx.user.id,
  });
  const localDecision = determineDisputeSubCase({
    disputeType: input.dispute_type as DisputeType,
    jobStatus: "unknown",
  });
  const neutralSummary = buildNeutralDisputeSummary({
    disputeType: input.dispute_type as DisputeType,
    initiatedBy: ctx.role,
    initiatorStatement: input.initiator_statement,
    evidenceCounts: {
      chatMessages: 0,
      photoUrls: evidencePhotoRefs.length,
      statusEvents: 0,
      scopeChanges: 0,
      kaelArtifacts: 0,
    },
  });
  const neutrality = assertNeutralDisputeLanguage(neutralSummary);
  if (!neutrality.ok) {
    apiFailure("KAEL_NEUTRALITY_GUARD", "Kael chỉ tóm tắt trung lập cho admin", 500);
  }

  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("open_dispute_atomic", {
      p_job_id: jobId,
      p_initiated_by_id: ctx.user.id,
      p_initiated_by: ctx.role,
      p_dispute_type: input.dispute_type,
      p_initiator_statement: input.initiator_statement,
      p_evidence_photo_urls: evidencePhotoRefs,
      p_kael_neutral_summary: neutralSummary,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể mở kiểm tra tranh chấp", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể mở kiểm tra tranh chấp", 500);
  if (!row.ok) mapDisputeOpenError(nullableString(row.error_code));

  const disputeId = asString(row.dispute_id);
  const evidenceSnapshotId = asString(row.evidence_snapshot_id);
  const status = nullableString(row.dispute_status) ?? "open";
  const priority = asDisputePriority(row.priority) ?? localDecision.priority;
  const evidenceLockedAt = asString(row.evidence_locked_at);
  const createdAt = asString(row.created_at_ts);

  await logJobEvent(
    client,
    jobId,
    "dispute_opened",
    ctx,
    null,
    null,
    {
      dispute_id: disputeId,
      dispute_type: input.dispute_type,
      evidence_snapshot_id: evidenceSnapshotId,
      priority,
      kael_neutral: true,
      sub_case: localDecision.subCase,
      deferred_phase0: localDecision.deferred,
    },
  );

  return {
    dispute_id: disputeId,
    job_id: jobId,
    status,
    dispute_type: input.dispute_type,
    evidence_snapshot_id: evidenceSnapshotId,
    admin_review_required: asBoolean(row.admin_review_required) ||
      localDecision.adminReviewRequired,
    priority,
    evidence_locked_at: evidenceLockedAt,
    message: localDecision.deferred
      ? "Kael đã khóa bằng chứng và chuyển admin xem xét; thanh toán được hoãn trong Phase 0."
      : "Kael đã khóa bằng chứng và chuyển admin xem xét trung lập.",
    created_at: createdAt,
  };
}

const DISPUTE_EVIDENCE_STAGES = [
  "before",
  "after",
  "kael_reference",
  "cancellation_evidence",
  "scope_change_evidence",
  "access_check_in",
] as const satisfies readonly JobEvidenceStage[];

export async function submitDisputeCounterStatement(
  ctx: MobileApiContext,
  disputeId: string,
  input: DisputeCounterStatementInput,
) {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("submit_counter_statement_atomic", {
      p_dispute_id: disputeId,
      p_actor_id: ctx.user.id,
      p_statement: input.statement,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể gửi phản hồi tranh chấp", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể gửi phản hồi tranh chấp", 500);
  if (!row.ok) mapDisputeCounterError(nullableString(row.error_code));

  return {
    dispute_id: asString(row.dispute_id) || disputeId,
    status: nullableString(row.dispute_status) ?? "admin_review",
    counter_party_statement_submitted: true,
    updated_at: asString(row.updated_at_ts),
  };
}

export async function decideDispute(
  ctx: MobileApiContext,
  disputeId: string,
  input: DisputeAdminDecisionInput,
) {
  if (ctx.role !== "admin") {
    apiFailure("AUTH_FORBIDDEN", "Chỉ admin mới được quyết định tranh chấp", 403);
  }
  const result = await dbQuery<Array<Record<string, unknown>>>(
    db(ctx).rpc("admin_decide_dispute_atomic", {
      p_dispute_id: disputeId,
      p_admin_id: ctx.user.id,
      p_outcome: input.outcome,
      p_refund_amount: input.refund_amount ?? null,
      p_worker_credit_amount: input.worker_credit_amount ?? null,
      p_customer_trust_impact: input.customer_trust_impact,
      p_worker_action: input.worker_action,
      p_reasoning: input.reasoning,
    }),
  );
  if (result.error) {
    apiFailure("DB_ERROR", "Không thể ghi quyết định tranh chấp", 500);
  }
  const row = result.data?.[0];
  if (!row) apiFailure("DB_ERROR", "Không thể ghi quyết định tranh chấp", 500);
  if (!row.ok) mapDisputeDecisionError(nullableString(row.error_code));

  return {
    dispute_id: asString(row.dispute_id) || disputeId,
    status: nullableString(row.dispute_status) ?? "admin_decided",
    outcome: input.outcome,
    decided_at: asString(row.decided_at_ts),
  };
}
