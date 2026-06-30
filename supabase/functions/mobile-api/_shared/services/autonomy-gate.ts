// Edge service autonomy gate (C4 6a, services/* split): thin wrapper over the Kael autonomy
// orchestrator for money/status policy decisions (cancellation / scope-change / completion).
// Imported directly by services.ts and the decision sub-domains.

import type { DbClient } from "./db.ts";
import type { MobileApiContext } from "../router.ts";
import type { JobStatus } from "../../../_shared/domain.ts";
import { runKaelAutonomyOrchestrator, type KaelAutonomyDecision, type KaelPermissionGateRequest } from "../kael/index.ts";

type PolicyAutonomyGateInput = {
  amountVnd?: number | null;
  authority: KaelPermissionGateRequest;
  client: DbClient;
  ctx: MobileApiContext;
  decision: KaelAutonomyDecision;
  from: JobStatus;
  jobId: string | null;
  knownEvidenceReferences: readonly string[];
  label: string;
  to: JobStatus;
};

export async function runPolicyAutonomyGate(input: PolicyAutonomyGateInput) {
  return runKaelAutonomyOrchestrator({
    label: input.label,
    decision: input.decision,
    from: input.from,
    to: input.to,
    authority: input.authority,
    knownEvidenceReferences: input.knownEvidenceReferences,
    source: "policy",
    amountVnd: input.amountVnd ?? null,
    audit: {
      client: input.client,
      jobId: input.jobId,
      actorId: input.ctx.user.id,
      actorRole: input.ctx.role,
      source: "policy",
    },
  });
}
