import { buildWorkerBriefOutput } from "../../kael/index.ts";
import { asServiceType, nullableNumber, nullableRecord, nullableString } from "../../platform/coercions.ts";
import { estimateWorkerNet, frozenWorkerCommissionTier } from "../payment/commission.ts";
import { projectAddressAccess } from "./apartment-access.ts";

/** Rebuild volatile assignment facts on read; a cached brief is not address or price authority. */
export function projectWorkerJobBrief(job: Record<string, unknown>, workerId: string) {
  if (!workerId || job.worker_id !== workerId) return null;
  const address = projectAddressAccess(job, "worker");
  if (address.addressAccess.release_stage === "area_only") return null;
  const finalPrice = positiveAmount(job.final_price);
  const autoQuote = job.quote_mode === "kael_auto_quote" || job.quote_mode == null;
  const min = finalPrice ?? (autoQuote ? positiveAmount(job.kael_price_min) : null);
  const max = finalPrice ?? (autoQuote ? positiveAmount(job.kael_price_max) : null);
  const hasRange = min !== null && max !== null && min <= max;
  const tier = frozenWorkerCommissionTier(job);
  const coreRecord = nullableRecord(job.kael_worker_brief_core);
  const core = nullableRecord(coreRecord?.brief) ?? coreRecord;
  const safety = nullableRecord(core?.sections)?.safety;
  return buildWorkerBriefOutput({
    stage: "guidance",
    serviceType: asServiceType(job.service_type),
    problemSummary: nullableString(job.kael_problem_identified) ?? "Yêu cầu cần thợ kiểm tra",
    district: nullableString(job.address_district),
    fullAddress: address.fullAddress,
    estimatedEarningMin: hasRange ? estimateWorkerNet(min, tier) : null,
    estimatedEarningMax: hasRange ? estimateWorkerNet(max, tier) : null,
    knowledgeSafetyGuidance: core?.schema_version === "worker_brief.v1" &&
        core.service_type === job.service_type && Array.isArray(safety)
      ? safety.filter((line): line is string => typeof line === "string")
      : [],
  });
}

function positiveAmount(value: unknown) {
  const amount = nullableNumber(value);
  return amount !== null && Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}
