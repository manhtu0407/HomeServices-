import { z } from "zod";
import { serviceTypeSchema } from "../../../../_shared/domain.ts";
import { buildWorkerBriefOutput, type EdgeAiSecrets } from "../../kael/index.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";
import { notifyBroadcastWorkers } from "../notification/notifications.ts";
import { geocodeConfirmedKaelJob } from "../places/geo.ts";
import type { ConfirmationOutboxClaim } from "./confirmation-outbox-dispatcher.ts";

const activationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("lease_lost") }).strict(),
  z.object({ state: z.literal("stopped") }).strict(),
  z.object({ state: z.literal("official_match") }).strict(),
  z.object({ state: z.literal("candidate_ready") }).strict(),
  z.object({ state: z.literal("no_reachable_worker") }).strict(),
  z.object({ state: z.literal("recovery_required"), error_code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/u) }).strict(),
  z.object({
    state: z.literal("broadcasting"), job_id: z.string().uuid(),
    confirmation_operation_id: z.string().uuid(), matching_operation_id: z.string().uuid(),
    service_type: serviceTypeSchema, district: z.string().min(1), problem_summary: z.string().min(1),
    expires_at: z.string().datetime({ offset: true }),
    targets: z.array(z.object({
      worker_id: z.string().uuid(), broadcast_id: z.string().uuid(),
      delivery_id: z.string().uuid(), operation_id: z.string().uuid(),
    }).strict()).min(1).max(5),
  }).strict(),
]);

export async function activateConfirmedMatching(
  client: DbClient, claim: ConfirmationOutboxClaim, secrets: EdgeAiSecrets,
) {
  const result = await dbQuery<unknown>(client.rpc("activate_confirmation_matching_outbox_claim", {
    p_outbox_id: claim.outboxId, p_lease_token: claim.leaseToken, p_operation_id: claim.operationId,
  }));
  if (result.error) throw new Error("CONFIRMATION_ACTIVATION_FAILED");
  const receipt = activationSchema.parse(result.data);
  if (receipt.state !== "broadcasting") return receipt;
  if (receipt.job_id !== claim.jobId || receipt.confirmation_operation_id !== claim.operationId
    || receipt.targets.some((target) => target.operation_id !== receipt.matching_operation_id)
    || ["worker_id", "broadcast_id", "delivery_id"].some((field) =>
      new Set(receipt.targets.map((target) => target[field as keyof typeof target])).size !== receipt.targets.length)
    || Date.parse(receipt.expires_at) <= Date.now()) {
    throw new Error("CONFIRMATION_ACTIVATION_RECEIPT_INVALID");
  }

  // Enrichment can be replayed after a restart; it cannot choose recipients or recreate delivery.
  await geocodeConfirmedKaelJob(client, claim.sessionId, claim.jobId, claim.customerId, receipt.district, secrets);
  const brief = buildWorkerBriefOutput({ stage: "core", serviceType: receipt.service_type,
    problemSummary: receipt.problem_summary, district: receipt.district });
  const enriched = await dbQuery(client.from("jobs").update({ kael_worker_brief_core: brief })
    .eq("id", claim.jobId).eq("customer_id", claim.customerId).is("kael_worker_brief_core", null));
  if (enriched.error) throw new Error("CONFIRMATION_BRIEF_ENRICHMENT_FAILED");
  await notifyBroadcastWorkers(client, claim.jobId, receipt.service_type, receipt.district,
    receipt.expires_at, receipt.targets.map((target) => ({ workerId: target.worker_id,
      broadcastId: target.broadcast_id, deliveryId: target.delivery_id, operationId: target.operation_id })));
  return receipt;
}
