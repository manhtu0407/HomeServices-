// Public coverage reports aggregate capacity only. Exact Worker identities remain inside the
// database-owned reservation command used by confirmation and matching.

import {
  serviceCoverageReadinessSchema,
  type EdgeServiceCoverageReadiness,
} from "../../../../_shared/contracts/stage1-reliability.ts";
import type { ServiceType } from "../../../../_shared/domain.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import type { MobileApiContext } from "../../platform/auth.ts";
import { dbQuery, type DbClient, workflowDb } from "../../platform/db.ts";

export const PUBLIC_COVERAGE_MINIMUM_WORKERS = 3;

type CoverageReadInput = {
  customerId: string;
  districtCode: string;
  serviceType: ServiceType;
};

export async function getServiceCoverageReadiness(
  ctx: MobileApiContext,
  input: Omit<CoverageReadInput, "customerId">,
): Promise<EdgeServiceCoverageReadiness> {
  return readServiceCoverageReadiness(workflowDb(ctx), {
    ...input,
    customerId: ctx.user.id,
  });
}

export async function readServiceCoverageReadiness(
  client: DbClient,
  input: CoverageReadInput,
): Promise<EdgeServiceCoverageReadiness> {
  const result = await dbQuery<Array<Record<string, unknown>>>(
    client.rpc("get_service_coverage_readiness", {
      p_customer_id: input.customerId,
      p_district_code: input.districtCode,
      p_service_type: input.serviceType,
    }),
  );
  if (result.error) {
    apiFailure("COVERAGE_UNAVAILABLE", "Không thể kiểm tra khả năng phục vụ lúc này", 503);
  }
  const row = result.data?.[0];
  const parsed = serviceCoverageReadinessSchema.safeParse(row);
  if (!parsed.success || parsed.data.minimum_worker_count !== PUBLIC_COVERAGE_MINIMUM_WORKERS) {
    apiFailure("COVERAGE_UNAVAILABLE", "Thông tin khả năng phục vụ chưa sẵn sàng", 503);
  }
  return parsed.data;
}
