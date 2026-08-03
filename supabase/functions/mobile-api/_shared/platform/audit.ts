// Platform audit writes for job events and Kael-memory records. Kael-specific provider,
// guardrail, and learning audit behavior belongs in ../kael/audit.ts.

import { dbQuery, type DbClient } from "./db.ts";
import type { MobileApiContext } from "./auth.ts";
import type { JobStatus } from "../../../_shared/domain.ts";

export async function logJobEvent(
  client: DbClient,
  jobId: string,
  eventType: string,
  actor: MobileApiContext,
  fromStatus: JobStatus | null,
  toStatus: JobStatus | null,
  metadata: Record<string, unknown> = {},
) {
  let failed = false;
  try {
    const result = await dbQuery(client.from("job_events").insert({
      job_id: jobId,
      actor_id: actor.user.id,
      actor_role: actor.role,
      event_type: eventType,
      from_status: fromStatus,
      to_status: toStatus,
      safe_metadata: metadata,
    }));
    failed = Boolean(result.error);
  } catch {
    failed = true;
  }
  if (failed) {
    console.warn("mobile-api job event log failed", { jobId, eventType });
  }
}

export async function logMemoryAudit(
  client: DbClient,
  input: {
    subjectType: "customer" | "worker" | "job" | "domain" | "system";
    subjectId: string | null;
    actorId: string | null;
    operation: "read" | "write" | "delete" | "archive";
    layer: string;
    purpose: string;
  },
) {
  let failed = false;
  try {
    const result = await dbQuery(client.from("kael_memory_audit").insert({
      subject_type: input.subjectType,
      subject_id: input.subjectId,
      actor_id: input.actorId,
      operation: input.operation,
      layer: input.layer,
      purpose: input.purpose,
      safe_metadata: {},
    }));
    failed = Boolean(result.error);
  } catch {
    failed = true;
  }
  if (failed) {
    console.warn("mobile-api kael memory audit failed", {
      subjectType: input.subjectType,
      operation: input.operation,
    });
  }
}
