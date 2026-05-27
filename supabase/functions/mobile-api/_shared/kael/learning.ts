import type { ComplexityLevel, EdgeAiSecrets, ServiceType, SupabaseLike } from "./types.ts";
import { withDbTimeout } from "./utils.ts";

type AppliedComplexityRule = {
  newComplexity: ComplexityLevel;
  ruleId: string;
  ruleVersion: number;
  fromComplexity: ComplexityLevel;
};

type AppliedPriceRule = {
  priceMin: number;
  priceMax: number;
  ruleId: string;
  ruleVersion: number;
};

export async function applyLearnedComplexityRule(
  supabase: SupabaseLike,
  secrets: EdgeAiSecrets,
  serviceType: ServiceType,
  problemSlug: string,
  district: string,
  currentComplexity: ComplexityLevel,
): Promise<AppliedComplexityRule | null> {
  if (!secrets.learningEnabled) return null;

  const { data: rows, error } = await withDbTimeout<{
    data: Array<Record<string, unknown>> | null;
    error: { code?: string; message?: string } | null;
  }>(
    supabase
      .from("learning_rules")
      .select("id, active_version, rule_payload, affected_district")
      .eq("rule_type", "analysis_rule")
      .eq("affected_service", serviceType)
      .eq("affected_problem", problemSlug)
      .in("affected_district", districtCandidates(district))
      .eq("status", "active") as PromiseLike<{
        data: Array<Record<string, unknown>> | null;
        error: { code?: string; message?: string } | null;
      }>,
  );
  if (error) {
    console.warn("applyLearnedComplexityRule: query failed", {
      errorCode: error.code,
    });
    return null;
  }

  const chosen = chooseLearningRule(rows, district);
  if (!chosen || !isAnalysisRulePayload(chosen.rule_payload)) return null;

  const suggested = chosen.rule_payload.suggested;
  if (!isRecord(suggested) || suggested.kind !== "raise_complexity_prior") {
    return null;
  }

  const from = asComplexityLevel(suggested.from);
  const to = asComplexityLevel(suggested.to);
  if (!from || !to) return null;

  const rank: Record<ComplexityLevel, number> = {
    small: 0,
    medium: 1,
    large: 2,
  };
  if (rank[currentComplexity] > rank[from] || rank[to] < rank[currentComplexity]) {
    return null;
  }

  const ruleId = typeof chosen.id === "string" ? chosen.id : null;
  const ruleVersion = integerFrom(chosen.active_version);
  if (!ruleId || ruleVersion === null) return null;
  return {
    newComplexity: to,
    ruleId,
    ruleVersion,
    fromComplexity: currentComplexity,
  };
}

export async function applyLearnedPriceRule(
  supabase: SupabaseLike,
  secrets: EdgeAiSecrets,
  serviceType: ServiceType,
  problemSlug: string,
  district: string,
): Promise<AppliedPriceRule | null> {
  if (!secrets.learningEnabled) return null;

  const { data: rows, error } = await withDbTimeout<{
    data: Array<Record<string, unknown>> | null;
    error: { code?: string; message?: string } | null;
  }>(
    supabase
      .from("learning_rules")
      .select("id, active_version, rule_payload, affected_district")
      .eq("rule_type", "price_prior_update")
      .eq("affected_service", serviceType)
      .eq("affected_problem", problemSlug)
      .in("affected_district", districtCandidates(district))
      .eq("status", "active") as PromiseLike<{
        data: Array<Record<string, unknown>> | null;
        error: { code?: string; message?: string } | null;
      }>,
  );
  if (error) {
    console.warn("applyLearnedPriceRule: query failed", {
      errorCode: error.code,
    });
    return null;
  }

  const chosen = chooseLearningRule(rows, district);
  if (!chosen || !isPricePriorPayload(chosen.rule_payload)) return null;

  const suggested = chosen.rule_payload.suggested;
  if (!isRecord(suggested)) return null;
  const priceMin = integerFrom(suggested.new_min);
  const priceMax = integerFrom(suggested.new_max);
  const ruleId = typeof chosen.id === "string" ? chosen.id : null;
  const ruleVersion = integerFrom(chosen.active_version);
  if (
    !ruleId ||
    ruleVersion === null ||
    priceMin === null ||
    priceMax === null ||
    priceMin <= 0 ||
    priceMax < priceMin
  ) {
    return null;
  }

  return {
    priceMin,
    priceMax,
    ruleId,
    ruleVersion,
  };
}

function districtCandidates(district: string): string[] {
  return district === "hcmc_all" ? ["hcmc_all"] : [district, "hcmc_all"];
}

function chooseLearningRule(
  rows: Array<Record<string, unknown>> | null,
  district: string,
): Record<string, unknown> | null {
  if (!rows || rows.length === 0) return null;
  const exact = rows.find((row) => row.affected_district === district);
  const citywide = rows.find((row) => row.affected_district === "hcmc_all");
  return exact ?? citywide ?? null;
}

function isPricePriorPayload(value: unknown): value is {
  candidate_type: "price_prior_update";
  suggested: Record<string, unknown>;
} {
  return isRecord(value) &&
    value.candidate_type === "price_prior_update" &&
    isRecord(value.suggested);
}

function isAnalysisRulePayload(value: unknown): value is {
  candidate_type: "analysis_rule";
  suggested: Record<string, unknown>;
} {
  return isRecord(value) &&
    value.candidate_type === "analysis_rule" &&
    isRecord(value.suggested);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asComplexityLevel(value: unknown): ComplexityLevel | null {
  return value === "small" || value === "medium" || value === "large"
    ? value
    : null;
}

function integerFrom(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) ? number : null;
}
