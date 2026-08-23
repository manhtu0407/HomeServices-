import type { ServiceType } from "../../../../_shared/domain.ts";
import type { KaelDiagnosisScopeArtifact } from "../../kael/contracts/artifact-contract.ts";
import { apiFailure } from "../../platform/api-failure.ts";
import { asRecord, asStringArray, nullableString } from "../../platform/coercions.ts";
import { dbQuery, type DbClient } from "../../platform/db.ts";

export type ActiveIntakePolicy = {
  policyId: string;
  version: number;
  quoteMode: "kael_auto_quote" | "rfq" | "inspection_only" | "blocked";
  tierAFields: string[];
  tierBSlots: Array<Record<string, unknown>>;
  questionOverrides: Record<string, unknown>;
  capabilityRequirements: string[];
  safetyRequirements: string[];
  evidenceRequirements: {
    minimumSourceCount: number;
    minimumHighTrustSourceCount: number;
    requiresActiveBaseline: boolean;
  };
  missingTierA: string[];
};

export type GroundedServiceProblem = {
  id: string;
  slug: string;
  labelVi: string;
};

export async function loadActiveIntakePolicy(
  input: {
    client: DbClient;
    sessionId: string;
    artifact: KaelDiagnosisScopeArtifact;
    serviceProblemId: string;
    service_type: ServiceType;
    district: string;
    customerAnalysisDetail: string;
    language: "vi" | "en";
  },
  problemSlug: string,
): Promise<ActiveIntakePolicy> {
  const policyResult = await dbQuery<Record<string, unknown>>(
    input.client.from("service_intake_policies")
      .select("id, version, quote_mode, tier_a_fields, tier_b_slots, question_overrides, safety_requirements, capability_requirements, evidence_requirements")
      .eq("service_problem_id", input.serviceProblemId)
      .eq("status", "active")
      .maybeSingle(),
  );
  if (policyResult.error || !policyResult.data) {
    apiFailure(
      "POLICY_UNAVAILABLE",
      input.language === "en"
        ? "The service policy is unavailable. Kael cannot continue safely."
        : "Chính sách dịch vụ chưa sẵn sàng. Kael chưa thể tiếp tục an toàn.",
      503,
    );
  }
  const contextResult = await dbQuery<Record<string, unknown>>(
    input.client.from("kael_chat_sessions")
      .select("scheduled_at, safe_metadata")
      .eq("id", input.sessionId)
      .maybeSingle(),
  );
  if (contextResult.error || !contextResult.data) {
    apiFailure("DB_ERROR", "Không thể kiểm tra dữ liệu yêu cầu", 500);
  }
  const context = contextResult.data as Record<string, unknown>;
  const metadata = asRecord(context.safe_metadata);
  const tierAFields = asStringArray(policyResult.data.tier_a_fields);
  const missingTierA = tierAFields.filter((field) => {
    switch (field) {
      case "service_type": return !input.service_type;
      case "problem_slug": return !problemSlug;
      case "address_district": return !input.district;
      case "address_label": return !nullableString(metadata.address_label);
      case "scheduled_at": return !nullableString(context.scheduled_at);
      case "description_min": return input.customerAnalysisDetail.trim().length < 10;
      default:
        return !nullableString(metadata[field]) &&
          !nullableString(input.artifact.facts[field]);
    }
  });
  const quoteMode = policyResult.data.quote_mode;
  if (quoteMode !== "kael_auto_quote" && quoteMode !== "rfq" &&
    quoteMode !== "inspection_only" && quoteMode !== "blocked") {
    apiFailure("POLICY_UNAVAILABLE", "Chính sách dịch vụ không hợp lệ", 503);
  }
  const evidenceRequirements = parseEvidenceRequirements(
    policyResult.data.evidence_requirements,
    quoteMode,
    input.language,
  );
  return {
    policyId: String(policyResult.data.id),
    version: Number(policyResult.data.version),
    quoteMode,
    tierAFields,
    tierBSlots: Array.isArray(policyResult.data.tier_b_slots)
      ? policyResult.data.tier_b_slots.filter((slot) => slot && typeof slot === "object") as Array<Record<string, unknown>>
      : [],
    questionOverrides: asRecord(policyResult.data.question_overrides),
    capabilityRequirements: asStringArray(policyResult.data.capability_requirements),
    safetyRequirements: asStringArray(policyResult.data.safety_requirements),
    evidenceRequirements,
    missingTierA,
  };
}

function parseEvidenceRequirements(
  value: unknown,
  quoteMode: ActiveIntakePolicy["quoteMode"],
  language: "vi" | "en",
): ActiveIntakePolicy["evidenceRequirements"] {
  const requirements = asRecord(value);
  const minimumSourceCount = requirements.minimum_source_count;
  const minimumHighTrustSourceCount = requirements.minimum_high_trust_source_count;
  const requiresActiveBaseline = requirements.requires_active_baseline;
  const valid = Number.isSafeInteger(minimumSourceCount) && Number(minimumSourceCount) >= 0 &&
    Number(minimumSourceCount) <= 50 && Number.isSafeInteger(minimumHighTrustSourceCount) &&
    Number(minimumHighTrustSourceCount) >= 0 &&
    Number(minimumHighTrustSourceCount) <= Number(minimumSourceCount) &&
    typeof requiresActiveBaseline === "boolean" &&
    (quoteMode !== "kael_auto_quote" || (requiresActiveBaseline &&
      Number(minimumSourceCount) >= 2 && Number(minimumHighTrustSourceCount) >= 1));
  if (!valid) {
    apiFailure(
      "POLICY_UNAVAILABLE",
      language === "en"
        ? "The active service policy has invalid evidence requirements."
        : "Chính sách dịch vụ hiện tại có yêu cầu bằng chứng không hợp lệ.",
      503,
    );
  }
  return {
    minimumSourceCount: Number(minimumSourceCount),
    minimumHighTrustSourceCount: Number(minimumHighTrustSourceCount),
    requiresActiveBaseline: Boolean(requiresActiveBaseline),
  };
}

export async function resolveGroundedServiceProblem(
  client: DbClient,
  serviceType: ServiceType,
  problemChips: readonly string[],
): Promise<GroundedServiceProblem | null> {
  const problemResult = await dbQuery<Array<Record<string, unknown>>>(
    client.from("service_problems")
      .select("id, slug, label_vi")
      .eq("service_type", serviceType)
      .eq("is_active", true),
  );
  if (problemResult.error || !problemResult.data) {
    apiFailure("POLICY_UNAVAILABLE", "Không thể xác minh chính sách dịch vụ đã chọn", 503);
  }
  const problems = problemResult.data.flatMap((row) => {
    const id = nullableString(row.id);
    const slug = nullableString(row.slug);
    const labelVi = nullableString(row.label_vi);
    return id && slug && labelVi ? [{ id, slug, labelVi }] : [];
  });
  for (const chip of problemChips) {
    const exactSlug = problems.find((problem) => problem.slug === chip.trim());
    if (exactSlug) return exactSlug;
    const normalizedChip = normalizeProblemSelection(chip);
    const exactLabel = problems.find((problem) =>
      normalizeProblemSelection(problem.labelVi) === normalizedChip
    );
    if (exactLabel) return exactLabel;
  }
  return null;
}

export function publicMissingTierA(fields: string[]) {
  return fields.map((field) => {
    if (field === "description_min") return "description" as const;
    if (
      field === "service_type" || field === "problem_slug" ||
      field === "address_label" || field === "address_district" ||
      field === "scheduled_at" || field === "description"
    ) return field;
    apiFailure("POLICY_UNAVAILABLE", "Chính sách dịch vụ chứa trường bắt buộc không hợp lệ", 503);
  });
}

function normalizeProblemSelection(value: string) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/đ/gu, "d")
    .replace(/Đ/gu, "D")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}
