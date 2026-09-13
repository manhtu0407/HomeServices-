import { dbQuery, type DbClient } from "../../platform/db.ts";

type ExpiryMaintenanceIdentity = {
  environment: string;
  releaseId: string;
  deploymentId: string | null;
};

export async function reconcileExpiredMatchingLeases(
  client: DbClient,
  identity: ExpiryMaintenanceIdentity,
) {
  if (!["staging", "production"].includes(identity.environment) ||
    !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(identity.releaseId) ||
    !identity.deploymentId) {
    throw new Error("MATCHING_EXPIRY_RELEASE_UNAVAILABLE");
  }
  const result = await dbQuery<number>(client.rpc("reconcile_expired_matching_leases", {
    p_environment: identity.environment,
    p_release_id: identity.releaseId,
    p_deployment_id: identity.deploymentId,
    p_limit: 50,
  }));
  if (result.error || typeof result.data !== "number" ||
    !Number.isSafeInteger(result.data) || result.data < 0 || result.data > 50) {
    throw new Error("MATCHING_EXPIRY_RECONCILE_FAILED");
  }
  return { reconciled: result.data };
}
