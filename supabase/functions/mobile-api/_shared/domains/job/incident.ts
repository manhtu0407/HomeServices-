import { db, dbQuery } from "../../platform/db.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { requireJobAccess } from "../../platform/access.ts";
import {
  INCIDENT_MESSAGES,
  type IncidentRow,
  serializeIncident,
} from "./incident-mutations.ts";

export {
  openJobIncident,
  proposeScopeChangeFromJobIncident,
  recordJobIncidentChatMessage,
} from "./incident-mutations.ts";

export async function getJobIncident(ctx: MobileApiContext, jobId: string) {
  const client = db(ctx);
  await requireJobAccess(client, jobId, ctx, {
    select: "id, customer_id, worker_id",
  });
  const result = await dbQuery<IncidentRow>(
    client
      .from("kael_job_incidents")
      .select(
        "id, job_id, status, evidence_status, last_summary, last_question, last_next_actor, created_at, updated_at",
      )
      .eq("job_id", jobId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (result.error) apiFailure("DB_ERROR", INCIDENT_MESSAGES.load, 500);
  return { incident: result.data ? serializeIncident(result.data) : null };
}
